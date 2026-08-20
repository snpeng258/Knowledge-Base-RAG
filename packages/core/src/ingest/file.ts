import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ingestRuns } from "../db/schema.ts";
import { DependencyError, isUnavailableMessage } from "../errors.ts";
import { enrichIngestedDocument } from "./enrich.ts";
import type { LlmProvider } from "../llm/types.ts";
import { splitIntoChunks } from "./chunk.ts";
import { persistDocument } from "./persist.ts";
import { canonicalLocalPath, slugFromFilePath } from "./slug.ts";

export type IngestFileResult = {
  documentId: string;
  action: "inserted" | "updated" | "skipped";
  chunkCount: number;
  ingestRunId: string;
};

type Db = ReturnType<typeof drizzle>;

function openDb(url: string) {
  const client = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  return { client, db: drizzle(client) };
}

function wrapIngestError(error: unknown): never {
  if (error instanceof DependencyError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (isUnavailableMessage(message)) {
    throw new DependencyError(`database unavailable: ${message}`);
  }
  throw error;
}

export async function ingestLocalFile(
  filePath: string,
  databaseUrl: string,
  options?: { llm?: LlmProvider | null },
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
  try {
    const [run] = await db
      .insert(ingestRuns)
      .values({
        sourceKind: "local_file",
        startedAt: new Date(),
        status: "running",
      })
      .returning({ id: ingestRuns.id });
    if (run === undefined) {
      throw new Error("failed to create ingest_runs row");
    }

    try {
      const result = await db.transaction((tx) => writeFileDocument(tx, absolutePath, content));
      await enrichIngestedDocument(databaseUrl, result.documentId, content, options?.llm);
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
      wrapIngestError(error);
    }
  } catch (error) {
    wrapIngestError(error);
  } finally {
    await client.end({ timeout: 1 });
  }
}

async function writeFileDocument(
  db: Parameters<typeof persistDocument>[0],
  absolutePath: string,
  content: string,
): Promise<Omit<IngestFileResult, "ingestRunId">> {
  const title = titleFromMarkdown(content) ?? slugFromFilePath(absolutePath);
  return persistDocument(db, {
    id: slugFromFilePath(absolutePath),
    kind: "file",
    title,
    content,
    sourceKind: "local_file",
    sourceRef: absolutePath,
    sourceUrl: null,
    occurredAt: null,
    meta: { path: absolutePath },
    pieces: splitIntoChunks(content).map((piece) => ({
      text: piece.text,
      charStart: piece.charStart,
      charEnd: piece.charEnd,
      speaker: null,
      tsStart: null,
    })),
  });
}

function titleFromMarkdown(content: string): string | undefined {
  const match = content.match(/^#\s+(.+)$/m);
  const heading = match?.[1]?.trim();
  return heading !== undefined && heading.length > 0 ? heading : undefined;
}
