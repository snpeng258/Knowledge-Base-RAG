import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ingestRuns } from "../db/schema.ts";
import { DependencyError, isUnavailableMessage } from "../errors.ts";
import { splitIntoChunks } from "./chunk.ts";
import { extractArticle } from "./extract-html.ts";
import { attachDescription, providerForRuntime } from "../llm/refine.ts";
import { persistDocument } from "./persist.ts";
import { defaultUrlFetcher, type UrlFetcher } from "./url-fetch.ts";
import { linkDocumentId, normalizeUrl } from "./url-normalize.ts";

export type IngestUrlResult = {
  documentId: string;
  action: "inserted" | "updated" | "skipped";
  chunkCount: number;
  sourceUrl: string;
  sourceRef: string;
};

export type IngestUrlFailure = {
  url: string;
  sourceRef: string;
  reason: string;
};

export type IngestUrlBatchResult = {
  successes: IngestUrlResult[];
  failures: IngestUrlFailure[];
};

function wrapDb(error: unknown): never {
  if (error instanceof DependencyError) {
    throw error;
  }
  const message = error instanceof Error ? error.message : String(error);
  if (isUnavailableMessage(message)) {
    throw new DependencyError(`database unavailable: ${message}`);
  }
  throw error;
}

async function recordFailure(
  databaseUrl: string,
  sourceRef: string,
  reason: string,
  parserTried: string,
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    await sql`
      INSERT INTO parse_failures (source_kind, source_ref, reason, parser_tried, created_at, resolved)
      VALUES ('url', ${sourceRef}, ${reason}, ${parserTried}, now(), false)
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function ingestUrl(
  rawUrl: string,
  databaseUrl: string,
  fetcher: UrlFetcher = defaultUrlFetcher,
): Promise<IngestUrlResult> {
  let sourceRef: string;
  try {
    sourceRef = normalizeUrl(rawUrl);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordFailure(databaseUrl, rawUrl, `invalid url: ${reason}`, "normalize");
    throw new Error(`invalid url: ${rawUrl}`);
  }
  let fetched;
  try {
    fetched = await fetcher(sourceRef);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await recordFailure(databaseUrl, sourceRef, reason, "http");
    throw new Error(`fetch failed for ${sourceRef}: ${reason}`);
  }
  const parsers = ["http"];
  if (fetched.status >= 400) {
    const reason = `http ${fetched.status}`;
    await recordFailure(databaseUrl, sourceRef, reason, parsers.join(","));
    throw new Error(`fetch failed for ${sourceRef}: ${reason}`);
  }
  const extracted = extractArticle(fetched.body, sourceRef);
  parsers.push(...extracted.parserTried);
  if (extracted.content.length === 0) {
    const reason = "empty extracted content";
    await recordFailure(databaseUrl, sourceRef, reason, parsers.join(","));
    throw new Error(`extract failed for ${sourceRef}: ${reason}`);
  }

  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  const db = drizzle(client);
  try {
    const [run] = await db
      .insert(ingestRuns)
      .values({ sourceKind: "url", startedAt: new Date(), status: "running" })
      .returning({ id: ingestRuns.id });
    if (run === undefined) {
      throw new Error("failed to create ingest_runs row");
    }
    try {
      const persisted = await db.transaction((tx) =>
        persistDocument(tx, {
          id: linkDocumentId(sourceRef),
          kind: "link",
          title: extracted.title,
          content: extracted.content,
          sourceKind: "url",
          sourceRef,
          sourceUrl: sourceRef,
          occurredAt: extracted.occurredAt,
          meta: { original_url: rawUrl },
          pieces: splitIntoChunks(extracted.content).map((piece) => ({
            text: piece.text,
            charStart: piece.charStart,
            charEnd: piece.charEnd,
            speaker: null,
            tsStart: null,
          })),
        }),
      );
      await attachDescription(databaseUrl, persisted.documentId, extracted.content, providerForRuntime());
      await db
        .update(ingestRuns)
        .set({ finishedAt: new Date(), docCount: 1, status: "success" })
        .where(eq(ingestRuns.id, run.id));
      return { ...persisted, sourceUrl: sourceRef, sourceRef };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .update(ingestRuns)
        .set({ finishedAt: new Date(), status: "failed", error: message })
        .where(eq(ingestRuns.id, run.id));
      wrapDb(error);
    }
  } catch (error) {
    wrapDb(error);
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function ingestUrls(
  urls: string[],
  databaseUrl: string,
  fetcher: UrlFetcher = defaultUrlFetcher,
): Promise<IngestUrlBatchResult> {
  const successes: IngestUrlResult[] = [];
  const failures: IngestUrlFailure[] = [];
  for (const url of urls) {
    try {
      successes.push(await ingestUrl(url, databaseUrl, fetcher));
    } catch (error) {
      if (error instanceof DependencyError) {
        throw error;
      }
      let sourceRef = url;
      try {
        sourceRef = normalizeUrl(url);
      } catch {
        sourceRef = url;
      }
      failures.push({
        url,
        sourceRef,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { successes, failures };
}
