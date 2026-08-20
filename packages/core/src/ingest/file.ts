import { readFile } from "node:fs/promises";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { chunks, documents, ingestRuns } from "../db/schema.ts";
import { splitIntoChunks } from "./chunk.ts";
import { sha256 } from "./hash.ts";
import { canonicalLocalPath, slugFromFilePath } from "./slug.ts";
import { tokenizeForSearch } from "./tokenize.ts";

export type IngestFileResult = {
  documentId: string;
  action: "inserted" | "updated" | "skipped";
  chunkCount: number;
  ingestRunId: string;
};

type Db = ReturnType<typeof drizzle>;
type QueryDb = Pick<Db, "select" | "insert" | "update" | "delete">;

function openDb(url: string) {
  const client = postgres(url, { max: 1, onnotice: () => undefined });
  return { client, db: drizzle(client) };
}

export async function ingestLocalFile(
  filePath: string,
  databaseUrl: string,
): Promise<IngestFileResult> {
  const absolutePath = canonicalLocalPath(filePath);
  let content: string;
  try {
    content = (await readFile(filePath, "utf8")).replace(/\r\n/g, "\n");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`cannot read ingest file: ${absolutePath} (${reason})`);
  }

  const { client, db } = openDb(databaseUrl);
  const [run] = await db
    .insert(ingestRuns)
    .values({
      sourceKind: "local_file",
      startedAt: new Date(),
      status: "running",
    })
    .returning({ id: ingestRuns.id });
  if (run === undefined) {
    await client.end();
    throw new Error("failed to create ingest_runs row");
  }

  try {
    const result = await db.transaction((tx) => writeDocument(tx, absolutePath, content));
    await db
      .update(ingestRuns)
      .set({
        finishedAt: new Date(),
        docCount: 1,
        status: "success",
      })
      .where(eq(ingestRuns.id, run.id));
    return { ...result, ingestRunId: String(run.id) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(ingestRuns)
      .set({
        finishedAt: new Date(),
        status: "failed",
        error: message,
      })
      .where(eq(ingestRuns.id, run.id));
    throw error;
  } finally {
    await client.end();
  }
}

async function writeDocument(
  db: QueryDb,
  absolutePath: string,
  content: string,
): Promise<Omit<IngestFileResult, "ingestRunId">> {
  const hash = sha256(content);
  const title = titleFromMarkdown(content) ?? slugFromFilePath(absolutePath);
  const pieces = splitIntoChunks(content);
  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.sourceKind, "local_file"), eq(documents.sourceRef, absolutePath)));

  if (existing !== undefined && existing.contentHash === hash) {
    const existingChunks = await db
      .select({ id: chunks.id })
      .from(chunks)
      .where(eq(chunks.documentId, existing.id));
    if (existingChunks.length === pieces.length) {
      await db
        .update(documents)
        .set({ updatedAt: new Date() })
        .where(eq(documents.id, existing.id));
      return { documentId: existing.id, action: "skipped", chunkCount: existingChunks.length };
    }
  }

  const documentId = existing?.id ?? slugFromFilePath(absolutePath);
  const docValues = {
    id: documentId,
    kind: "file" as const,
    title,
    description: null,
    content,
    contentHash: hash,
    lang: "zh",
    sourceKind: "local_file",
    sourceRef: absolutePath,
    sourceUrl: null,
    status: "draft",
    wordCount: tokenizeForSearch(content).split(" ").filter((part) => part.length > 0).length,
    searchVector: sql`to_tsvector('simple', ${tokenizeForSearch(content)})`,
    meta: { path: absolutePath },
    updatedAt: new Date(),
  };

  if (existing === undefined) {
    await db.insert(documents).values(docValues);
  } else {
    await db.update(documents).set(docValues).where(eq(documents.id, documentId));
    await db.delete(chunks).where(eq(chunks.documentId, documentId));
  }

  if (pieces.length > 0) {
    await db.insert(chunks).values(
      pieces.map((piece) => ({
        documentId,
        ord: piece.ord,
        text: piece.text,
        charStart: piece.charStart,
        charEnd: piece.charEnd,
        searchVector: sql`to_tsvector('simple', ${tokenizeForSearch(piece.text)})`,
      })),
    );
  }

  return {
    documentId,
    action: existing === undefined ? "inserted" : "updated",
    chunkCount: pieces.length,
  };
}

function titleFromMarkdown(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading !== undefined && heading.length > 0 ? heading : undefined;
}
