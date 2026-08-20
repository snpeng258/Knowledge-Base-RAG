import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { extractArticle } from "./extract-html.ts";
import { ingestUrl, ingestUrls } from "./url.ts";
import { normalizeUrl } from "./url-normalize.ts";
import type { UrlFetcher } from "./url-fetch.ts";

const root = repoRootFrom(import.meta.url);
loadEnvFiles(root);

test("URL variants collapse to one source_ref", () => {
  const a = normalizeUrl("https://Example.com/posts/hello/?utm_source=x&fbclid=1");
  const b = normalizeUrl("https://example.com/posts/hello/");
  assert.equal(a, b);
  assert.equal(a, "https://example.com/posts/hello");
});

test("html extractor reads article body, title, and published time", async () => {
  const html = await readFile(resolve(root, "fixtures/eval/sample-article.html"), "utf8");
  const extracted = extractArticle(html, "fallback");
  assert.match(extracted.title, /脱敏 fixture/);
  assert.match(extracted.content, /正文抽取/);
  assert.ok(extracted.occurredAt !== null);
});

test("url ingest is idempotent, records failures, and batch uses mixed outcomes", async () => {
  await runMigrations();
  const url = databaseUrl();
  const html = await readFile(resolve(root, "fixtures/eval/sample-article.html"), "utf8");
  const fetcher: UrlFetcher = async (href) => {
    if (href.includes("missing.invalid")) {
      throw new Error("getaddrinfo ENOTFOUND missing.invalid");
    }
    return { status: 200, contentType: "text/html", body: html };
  };

  const first = await ingestUrl("https://example.com/kb-eval/article/?utm_campaign=night", url, fetcher);
  const second = await ingestUrl("https://example.com/kb-eval/article/", url, fetcher);
  assert.equal(first.documentId, second.documentId);
  assert.equal(second.action, "skipped");
  assert.ok(first.sourceUrl.length > 0);
  assert.match(first.documentId, /^link-/);

  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const docs = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM documents WHERE source_kind = 'url' AND source_ref = ${first.sourceRef}
    `;
    assert.equal(docs[0]?.count, "1");
    const [doc] = await sql<{ content: string; source_url: string | null; source_kind: string }[]>`
      SELECT content, source_url, source_kind FROM documents WHERE id = ${first.documentId}
    `;
    assert.ok(doc);
    assert.equal(doc.source_kind, "url");
    assert.ok(doc.source_url !== null && doc.source_url.length > 0);
    assert.match(doc.content, /正文抽取/);
    const chunks = await sql<{ text: string; char_start: number; char_end: number }[]>`
      SELECT text, char_start, char_end FROM chunks WHERE document_id = ${first.documentId} ORDER BY ord
    `;
    assert.ok(chunks.length > 0);
    for (const chunk of chunks) {
      assert.equal(doc.content.slice(chunk.char_start, chunk.char_end), chunk.text);
    }

    const failRef = "https://missing.invalid/nope";
    const beforeFail = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM parse_failures WHERE source_ref = ${failRef}
    `;
    const batch = await ingestUrls(
      ["https://example.com/kb-eval/article/", failRef],
      url,
      fetcher,
    );
    assert.equal(batch.successes.length, 1);
    assert.equal(batch.failures.length, 1);
    const afterFail = await sql<{ count: string; reason: string }[]>`
      SELECT count(*)::text AS count, max(reason) AS reason FROM parse_failures WHERE source_ref = ${failRef}
    `;
    assert.equal(Number(afterFail[0]?.count ?? "0"), Number(beforeFail[0]?.count ?? "0") + 1);
    assert.match(afterFail[0]?.reason ?? "", /ENOTFOUND|fetch failed|missing/i);

    const beforeInvalid = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM parse_failures WHERE source_ref = ${"not-a-url"}
    `;
    const invalidBatch = await ingestUrls(["not-a-url"], url, fetcher);
    assert.equal(invalidBatch.successes.length, 0);
    assert.equal(invalidBatch.failures.length, 1);
    const afterInvalid = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM parse_failures WHERE source_ref = ${"not-a-url"}
    `;
    assert.equal(Number(afterInvalid[0]?.count ?? "0"), Number(beforeInvalid[0]?.count ?? "0") + 1);
  } finally {
    await sql.end({ timeout: 1 });
  }
});

test("retrieve sources do not call the network", async () => {
  const dir = resolve(root, "packages/core/src/retrieve");
  const files = (await readdir(dir)).filter((name) => extname(name) === ".ts");
  assert.ok(files.length > 0);
  for (const name of files) {
    const text = await readFile(join(dir, name), "utf8");
    assert.doesNotMatch(text, /\bfetch\s*\(/);
    assert.doesNotMatch(text, /defaultUrlFetcher|ingestUrl/);
  }
});
