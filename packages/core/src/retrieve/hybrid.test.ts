import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { embedMissingChunks } from "../embed/ingest.ts";
import type { Embedder } from "../embed/types.ts";
import { ingestLocalFile } from "../ingest/file.ts";
import { FulltextRetriever } from "./fulltext.ts";
import { HybridRetriever } from "./hybrid.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

function constantEmbedder(): Embedder {
  const vector = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 0.2 : 0.001));
  return {
    name: "mock-embedder",
    modelName: "BAAI/bge-m3",
    dim: 1024,
    async info() {
      return { modelName: "BAAI/bge-m3" };
    },
    async embed(texts: string[]) {
      return texts.map(() => vector);
    },
  };
}

function downEmbedder(): Embedder {
  return {
    name: "down",
    modelName: "BAAI/bge-m3",
    dim: 1024,
    async info() {
      throw new Error("connect ECONNREFUSED");
    },
    async embed() {
      return [];
    },
  };
}

test("hybrid search hits a semantic query that fulltext misses and degrades without the embedder", async () => {
  await runMigrations();
  const url = databaseUrl();
  const dir = await mkdtemp(join(tmpdir(), "kb-hybrid-"));
  const fixture = join(dir, "sample.md");
  await writeFile(fixture, "# 回到原文\n\n检索结果必须能定位到讲话在文稿中的位置。\n", "utf8");
  try {
    const ingested = await ingestLocalFile(fixture, url, { llm: null });
    await embedMissingChunks(url, constantEmbedder());
    const hybrid = new HybridRetriever(url, constantEmbedder());
    const lexical = new FulltextRetriever(url);
    const semanticQuery = "source passage highlighting";
    const vectorHit = await hybrid.search({ query: semanticQuery });
    const lexicalHit = await lexical.search({ query: semanticQuery });
    assert.equal(vectorHit.stage, "hybrid");
    assert.equal(vectorHit.degraded, false);
    assert.ok(vectorHit.results.some((item) => item.id === ingested.documentId));
    assert.equal(lexicalHit.results.some((item) => item.id === ingested.documentId), false);

    const hybridCard = vectorHit.results[0];
    const lexicalCard = (await lexical.search({ query: "回到原文" })).results[0];
    assert.ok(hybridCard !== undefined);
    assert.ok(lexicalCard !== undefined);
    assert.deepEqual(Object.keys(hybridCard).sort(), Object.keys(lexicalCard).sort());

    const degraded = await new HybridRetriever(url, downEmbedder()).search({ query: "回到原文" });
    assert.equal(degraded.stage, "fulltext");
    assert.equal(degraded.degraded, true);
    assert.ok(degraded.results.length > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
