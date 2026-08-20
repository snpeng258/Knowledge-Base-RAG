import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { DependencyError } from "../errors.ts";
import { createAuthFailClient, type LarkMinutesClient } from "../lark/cli.ts";
import { FulltextRetriever } from "../retrieve/fulltext.ts";
import { ingestLarkMinute, listLarkMinutes } from "./lark.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

const TOKEN = "obcn-fixture-eval-minutes";

async function fixtureClient(): Promise<LarkMinutesClient> {
  const transcript = await readFile(
    resolve(repoRootFrom(import.meta.url), "fixtures/eval/sample-minutes-transcript.txt"),
    "utf8",
  );
  return {
    async listMinutes() {
      return [{ token: TOKEN, title: "脱敏妙记评测", occurredAt: new Date("2026-08-12T10:00:00+08:00"), url: null }];
    },
    async fetchTranscript(token: string) {
      return {
        token,
        title: "脱敏妙记评测",
        occurredAt: new Date("2026-08-12T10:00:00+08:00"),
        url: null,
        transcript,
      };
    },
  };
}

test("lark ingest fills speaker, timestamp, occurred_at and is idempotent", async () => {
  await runMigrations();
  const url = databaseUrl();
  const client = await fixtureClient();
  const first = await ingestLarkMinute(TOKEN, url, client);
  const second = await ingestLarkMinute(TOKEN, url, client);
  assert.equal(first.documentId, second.documentId);
  assert.equal(second.action, "skipped");
  assert.match(first.documentId, /^mtg-/);

  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const docs = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM documents WHERE source_kind = 'lark_minutes' AND source_ref = ${TOKEN}
    `;
    assert.equal(docs[0]?.count, "1");
    const [doc] = await sql<{ content: string; occurred_at: Date | null }[]>`
      SELECT content, occurred_at FROM documents WHERE id = ${first.documentId}
    `;
    assert.ok(doc);
    assert.ok(doc.occurred_at !== null);
    const chunkRows = await sql<{ text: string; char_start: number; char_end: number; speaker: string | null; ts_start: number | null }[]>`
      SELECT text, char_start, char_end, speaker, ts_start FROM chunks WHERE document_id = ${first.documentId} ORDER BY ord
    `;
    assert.ok(chunkRows.length >= 2);
    for (const chunk of chunkRows) {
      assert.equal(doc.content.slice(chunk.char_start, chunk.char_end), chunk.text);
      assert.ok(chunk.speaker !== null && chunk.speaker.length > 0);
      assert.ok(chunk.ts_start !== null);
    }
  } finally {
    await sql.end({ timeout: 1 });
  }

  const hit = await new FulltextRetriever(url).search({ query: "产品力", kind: "meeting" });
  assert.ok(hit.results.some((card) => card.id === first.documentId));
});

test("lark auth failure is a dependency error", async () => {
  await assert.rejects(
    () => listLarkMinutes(createAuthFailClient("lark authorization failed: token expired")),
    (error: unknown) => error instanceof DependencyError && /authorization|token expired/i.test(error.message),
  );
});
