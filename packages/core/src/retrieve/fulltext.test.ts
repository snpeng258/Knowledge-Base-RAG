import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { ingestLocalFile } from "../ingest/file.ts";
import { tokenizeForSearch as writeTokenizer } from "../ingest/tokenize.ts";
import { FulltextRetriever } from "./fulltext.ts";
import { tokenizeForSearch as readTokenizer } from "./query.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

test("write and read paths share the same tokenizer", () => {
  assert.equal(writeTokenizer, readTokenizer);
});

test("fulltext retriever does not import model clients", async () => {
  const dir = new URL("./", import.meta.url);
  const files = ["fulltext.ts", "query.ts", "types.ts"];
  for (const name of files) {
    const src = await readFile(new URL(name, dir), "utf8");
    assert.doesNotMatch(src, /ollama|tei|openai/i);
  }
});

test("fulltext search returns cards without content", async () => {
  await runMigrations();
  const url = databaseUrl();
  const fixture = resolve(repoRootFrom(import.meta.url), "fixtures/sample-meeting.md");
  const ingested = await ingestLocalFile(fixture, url);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql`INSERT INTO tags (slug, name) VALUES ('product-strategy', '产品策略') ON CONFLICT (slug) DO NOTHING`;
    await sql`
      INSERT INTO document_tags (document_id, tag_slug, source)
      VALUES (${ingested.documentId}, 'product-strategy', 'human')
      ON CONFLICT (document_id, tag_slug) DO NOTHING
    `;

    const [stored] = await sql<{ content: string }[]>`
      SELECT content FROM documents WHERE id = ${ingested.documentId}
    `;
    assert.ok(stored);

    const retriever = new FulltextRetriever(url);
    const hit = await retriever.search({ query: "产品力" });
    assert.equal(hit.stage, "fulltext");
    assert.equal(hit.degraded, false);
    const card = hit.results.find((item) => item.id === ingested.documentId);
    assert.ok(card);
    assert.equal(Object.hasOwn(card, "content"), false);
    assert.ok(card.hits.length > 0);
    for (const item of card.hits) {
      const slice = stored.content.slice(item.charStart, item.charEnd);
      const inner = item.snippet.replace(/^…/, "").replace(/…$/, "");
      assert.equal(slice, inner);
      assert.ok(inner.includes("产品力"));
    }

    const miss = await retriever.search({ query: "不可能出现的词xyzzy" });
    assert.equal(miss.results.length, 0);

    const byTag = await retriever.search({ query: "产品力", tags: ["product-strategy"] });
    assert.ok(byTag.results.some((item) => item.id === ingested.documentId));
    assert.ok(byTag.results.every((item) => item.tags.includes("product-strategy")));

    const byWrongTag = await retriever.search({ query: "产品力", tags: ["no-such-tag"] });
    assert.equal(byWrongTag.results.length, 0);

    const byKind = await retriever.search({ query: "产品力", kind: "file" });
    assert.ok(byKind.results.every((item) => item.kind === "file"));

    const byOtherKind = await retriever.search({ query: "产品力", kind: "meeting" });
    assert.equal(byOtherKind.results.length, 0);

    const limited = await retriever.search({ query: "产品力", limit: 1 });
    assert.ok(limited.results.length <= 1);
  } finally {
    await sql`DELETE FROM documents WHERE id = ${ingested.documentId}`;
    await sql.end();
  }
});
