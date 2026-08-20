import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { DependencyError } from "../errors.ts";
import { ingestLocalFile } from "../ingest/file.ts";
import { CHUNK_EMBEDDINGS_INDEX, embedMissingChunks } from "./ingest.ts";
import { parseEmbeddingMatrix, type Embedder } from "./tei.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

function mockEmbedder(): Embedder {
  return {
    name: "mock-tei",
    modelName: "BAAI/bge-m3",
    dim: 1024,
    async info() {
      return { modelName: "BAAI/bge-m3" };
    },
    async embed(texts: string[]) {
      return texts.map(() => Array.from({ length: 1024 }, (_, index) => (index === 0 ? 0.05 : 0)));
    },
  };
}

test("parseEmbeddingMatrix rejects non-numeric rows", () => {
  assert.deepEqual(parseEmbeddingMatrix([[0.1, 0.2]]), [[0.1, 0.2]]);
  assert.throws(() => parseEmbeddingMatrix({}));
});

test("embed missing chunks is incremental and creates the hnsw index", async () => {
  await runMigrations();
  const url = databaseUrl();
  const dir = await mkdtemp(join(tmpdir(), "kb-embed-"));
  const fixture = join(dir, "sample.md");
  await writeFile(fixture, "# 向量灌入测试\n\n切片需要 1024 维向量，检索路径本 issue 不改。\n", "utf8");
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  let documentId = "";
  try {
    const ingested = await ingestLocalFile(fixture, url, { llm: null });
    documentId = ingested.documentId;
    const first = await embedMissingChunks(url, mockEmbedder());
    const chunks = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM chunks WHERE document_id = ${ingested.documentId}
    `;
    const embeddings = await sql<{ count: string; dim: number; model_name: string }[]>`
      SELECT count(*)::text AS count, max(dim) AS dim, min(model_name) AS model_name
      FROM chunk_embeddings e
      JOIN chunks c ON c.id = e.chunk_id
      WHERE c.document_id = ${ingested.documentId}
    `;
    assert.equal(embeddings[0]?.count, chunks[0]?.count);
    assert.equal(embeddings[0]?.dim, 1024);
    assert.equal(embeddings[0]?.model_name, "BAAI/bge-m3");
    assert.ok(first.embedded > 0);

    const second = await embedMissingChunks(url, mockEmbedder());
    assert.equal(second.embedded, 0);

    const indexes = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexname = ${CHUNK_EMBEDDINGS_INDEX}
    `;
    assert.equal(indexes.length, 1);
  } finally {
    if (documentId.length > 0) {
      await sql`DELETE FROM documents WHERE id = ${documentId}`;
    }
    await sql.end({ timeout: 1 });
    await rm(dir, { recursive: true, force: true });
  }
});

test("unreachable TEI is a dependency error", async () => {
  await runMigrations();
  await assert.rejects(
    () =>
      embedMissingChunks(databaseUrl(), {
        name: "down",
        modelName: "BAAI/bge-m3",
        dim: 1024,
        async info() {
          throw new Error("connect ECONNREFUSED");
        },
        async embed() {
          return [];
        },
      }),
    (error: unknown) => error instanceof DependencyError,
  );
});
