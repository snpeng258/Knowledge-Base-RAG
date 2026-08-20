import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { chunks, documents } from "../db/schema.ts";
import { sha256 } from "./hash.ts";
import { tokenizeForSearch } from "./tokenize.ts";

type Db = ReturnType<typeof drizzle>;
export type QueryDb = Pick<Db, "select" | "insert" | "update" | "delete">;

export type PersistChunk = {
  text: string;
  charStart: number;
  charEnd: number;
  speaker: string | null;
  tsStart: number | null;
};

export type PersistInput = {
  id: string;
  kind: string;
  title: string;
  content: string;
  sourceKind: string;
  sourceRef: string;
  sourceUrl: string | null;
  occurredAt: Date | null;
  meta: Record<string, unknown>;
  pieces: PersistChunk[];
};

export type PersistResult = {
  documentId: string;
  action: "inserted" | "updated" | "skipped";
  chunkCount: number;
};

export async function persistDocument(db: QueryDb, input: PersistInput): Promise<PersistResult> {
  const hash = sha256(input.content);
  const [existing] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.sourceKind, input.sourceKind), eq(documents.sourceRef, input.sourceRef)));

  if (existing !== undefined && existing.contentHash === hash) {
    const existingChunks = await db
      .select({ id: chunks.id })
      .from(chunks)
      .where(eq(chunks.documentId, existing.id));
    if (existingChunks.length === input.pieces.length) {
      await db
        .update(documents)
        .set({ updatedAt: new Date() })
        .where(eq(documents.id, existing.id));
      return { documentId: existing.id, action: "skipped", chunkCount: existingChunks.length };
    }
  }

  const documentId = existing?.id ?? input.id;
  const docValues = {
    id: documentId,
    kind: input.kind,
    title: input.title,
    description: null,
    content: input.content,
    contentHash: hash,
    lang: "zh",
    sourceKind: input.sourceKind,
    sourceRef: input.sourceRef,
    sourceUrl: input.sourceUrl,
    occurredAt: input.occurredAt,
    status: "draft",
    wordCount: tokenizeForSearch(input.content).split(" ").filter((part) => part.length > 0).length,
    searchVector: sql`to_tsvector('simple', ${tokenizeForSearch(input.content)})`,
    meta: input.meta,
    updatedAt: new Date(),
  };

  if (existing === undefined) {
    await db.insert(documents).values(docValues);
  } else {
    await db.update(documents).set(docValues).where(eq(documents.id, documentId));
    await db.delete(chunks).where(eq(chunks.documentId, documentId));
  }

  if (input.pieces.length > 0) {
    await db.insert(chunks).values(
      input.pieces.map((piece, ord) => ({
        documentId,
        ord,
        text: piece.text,
        charStart: piece.charStart,
        charEnd: piece.charEnd,
        speaker: piece.speaker,
        tsStart: piece.tsStart,
        searchVector: sql`to_tsvector('simple', ${tokenizeForSearch(piece.text)})`,
      })),
    );
  }

  return {
    documentId,
    action: existing === undefined ? "inserted" : "updated",
    chunkCount: input.pieces.length,
  };
}
