import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import type { Embedder } from "../embed/types.ts";
import { ingestLocalFile } from "../ingest/file.ts";
import { FulltextRetriever } from "./fulltext.ts";
import { HybridRetriever } from "./hybrid.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

function constantEmbedder(modelName: string): Embedder {
  const vector = Array.from({ length: 1024 }, (_, index) => (index === 0 ? 0.2 : 0.001));
  return {
    name: "mock-embedder",
    modelName,
    dim: 1024,
    async info() {
      return { modelName };
    },
    async embed(texts: string[]) {
      return texts.map(() => vector);
    },
  };
}

function downEmbedder(): Embedder {
  return {
    name: "down",
    modelName: "hybrid-test-const",
    dim: 1024,
    async info() {
      throw new Error("connect ECONNREFUSED");
    },
    async embed() {
      return [];
    },
  };
}

async function embedDocument(url: string, documentId: string, embedder: Embedder): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    const info = await embedder.info();
    const chunks = await sql<{ id: string; text: string }[]>`
      SELECT id::text AS id, text FROM chunks WHERE document_id = ${documentId}
    `;
    const vectors = await embedder.embed(chunks.map((row) => row.text));
    for (let i = 0; i < chunks.length; i += 1) {
      const row = chunks[i];
      const vector = vectors[i];
      if (row === undefined || vector === undefined) {
        throw new Error("embed alignment error");
      }
      await sql.unsafe(
        `INSERT INTO chunk_embeddings (chunk_id, model_name, dim, embedding)
         VALUES ($1::bigint, $2, $3, $4::vector)
         ON CONFLICT (chunk_id, model_name) DO NOTHING`,
        [row.id, info.modelName, embedder.dim, `[${vector.join(",")}]`],
      );
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
}

test("hybrid search hits a semantic query that fulltext misses and degrades without the embedder", async () => {
  await runMigrations();
  const url = databaseUrl();
  const dir = await mkdtemp(join(tmpdir(), "kb-hybrid-"));
  const fixture = join(dir, "sample.md");
  await writeFile(fixture, "# 回到原文\n\n检索结果必须能定位到讲话在文稿中的位置。\n", "utf8");
  const embedder = constantEmbedder(`hybrid-one-${Date.now()}`);
  try {
    const ingested = await ingestLocalFile(fixture, url, { llm: null });
    await embedDocument(url, ingested.documentId, embedder);
    const hybrid = new HybridRetriever(url, embedder);
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

test("rerank reorders the same recall set and skips when the ranker fails", async () => {
  await runMigrations();
  const url = databaseUrl();
  const dir = await mkdtemp(join(tmpdir(), "kb-rerank-"));
  try {
    const firstPath = join(dir, "a.md");
    const secondPath = join(dir, "b.md");
    const thirdPath = join(dir, "c.md");
    await writeFile(firstPath, "# Alpha\n\n回到原文 alpha passage.\n", "utf8");
    await writeFile(secondPath, "# Beta\n\n回到原文 beta passage.\n", "utf8");
    await writeFile(thirdPath, "# Gamma\n\n回到原文 gamma passage.\n", "utf8");
    const embedder = constantEmbedder(`hybrid-three-${Date.now()}`);
    const first = await ingestLocalFile(firstPath, url, { llm: null });
    const second = await ingestLocalFile(secondPath, url, { llm: null });
    const third = await ingestLocalFile(thirdPath, url, { llm: null });
    await embedDocument(url, first.documentId, embedder);
    await embedDocument(url, second.documentId, embedder);
    await embedDocument(url, third.documentId, embedder);

    const recalled = await new HybridRetriever(url, embedder).search({
      query: "source passage highlighting",
    });
    assert.ok(recalled.results.length >= 2, "need at least two cards to prove reorder");
    const recalledIds = recalled.results.map((row) => row.id);

    const reverse = await new HybridRetriever(url, embedder, {
      enabled: true,
      reranker: {
        async rerank(input) {
          return input.texts.map((_, index) => ({ index, score: index }));
        },
      },
    }).search({ query: "source passage highlighting" });
    assert.equal(reverse.stage, "rerank");
    assert.deepEqual([...reverse.results.map((row) => row.id)].sort(), [...recalledIds].sort());
    assert.notDeepEqual(
      reverse.results.map((row) => row.id),
      recalledIds,
    );

    let seen = 0;
    const capped = await new HybridRetriever(url, embedder, {
      enabled: true,
      candidateLimit: 2,
      reranker: {
        async rerank(input) {
          seen = input.texts.length;
          return input.texts.map((_, index) => ({ index, score: 1 - index }));
        },
      },
    }).search({ query: "source passage highlighting", limit: 10 });
    assert.equal(seen, 2);
    assert.deepEqual(
      [...capped.results.map((row) => row.id)].sort(),
      [...recalled.results.map((row) => row.id)].sort(),
    );

    const skipped = await new HybridRetriever(url, embedder, {
      enabled: true,
      timeoutMs: 40,
      reranker: {
        rerank() {
          return new Promise(() => undefined);
        },
      },
    }).search({ query: "source passage highlighting" });
    assert.equal(skipped.stage, "hybrid");
    assert.deepEqual(
      skipped.results.map((row) => row.id),
      recalledIds,
    );

    const down = await new HybridRetriever(url, embedder, {
      enabled: true,
      reranker: {
        async rerank() {
          throw new Error("connect ECONNREFUSED");
        },
      },
    }).search({ query: "source passage highlighting" });
    assert.equal(down.stage, "hybrid");
    assert.ok(down.results.length > 0);

    const emptyPayload = await new HybridRetriever(url, embedder, {
      enabled: true,
      reranker: {
        async rerank() {
          return [];
        },
      },
    }).search({ query: "source passage highlighting" });
    assert.equal(emptyPayload.stage, "hybrid");
    assert.deepEqual(
      emptyPayload.results.map((row) => row.id),
      recalledIds,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
