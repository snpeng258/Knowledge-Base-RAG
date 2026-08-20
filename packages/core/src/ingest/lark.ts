import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ingestRuns } from "../db/schema.ts";
import { DependencyError, isUnavailableMessage } from "../errors.ts";
import { LarkCliClient, type LarkMinutesClient } from "../lark/cli.ts";
import { documentFromUtterances, meetingDocumentId, parseMinutesTranscript } from "./lark-transcript.ts";
import { persistDocument } from "./persist.ts";

export type IngestLarkResult = {
  documentId: string;
  action: "inserted" | "updated" | "skipped";
  chunkCount: number;
  ingestRunId: string;
  minuteToken: string;
};

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

export async function ingestLarkMinute(
  token: string,
  databaseUrl: string,
  client: LarkMinutesClient = new LarkCliClient(),
): Promise<IngestLarkResult> {
  const fetched = await client.fetchTranscript(token);
  const utterances = parseMinutesTranscript(fetched.transcript);
  if (utterances.length === 0) {
    throw new Error(`minute ${token} has no speaker turns in the transcript`);
  }
  const { content, pieces } = documentFromUtterances(utterances);
  const { client: sqlClient, db } = openDb(databaseUrl);
  try {
    const [run] = await db
      .insert(ingestRuns)
      .values({
        sourceKind: "lark_minutes",
        startedAt: new Date(),
        status: "running",
      })
      .returning({ id: ingestRuns.id });
    if (run === undefined) {
      throw new Error("failed to create ingest_runs row");
    }
    try {
      const result = await db.transaction((tx) =>
        persistDocument(tx, {
          id: meetingDocumentId(fetched.title, fetched.token),
          kind: "meeting",
          title: fetched.title,
          content,
          sourceKind: "lark_minutes",
          sourceRef: fetched.token,
          sourceUrl: fetched.url,
          occurredAt: fetched.occurredAt,
          meta: { minute_token: fetched.token },
          pieces: pieces.map((piece) => ({
            text: piece.text,
            charStart: piece.charStart,
            charEnd: piece.charEnd,
            speaker: piece.speaker,
            tsStart: piece.tsStart,
          })),
        }),
      );
      await db
        .update(ingestRuns)
        .set({ finishedAt: new Date(), docCount: 1, status: "success" })
        .where(eq(ingestRuns.id, run.id));
      return { ...result, ingestRunId: String(run.id), minuteToken: fetched.token };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(ingestRuns)
        .set({ finishedAt: new Date(), status: "failed", error: message })
        .where(eq(ingestRuns.id, run.id));
      wrapIngestError(error);
    }
  } catch (error) {
    wrapIngestError(error);
  } finally {
    await sqlClient.end({ timeout: 1 });
  }
}

export async function listLarkMinutes(client: LarkMinutesClient = new LarkCliClient()) {
  return client.listMinutes();
}
