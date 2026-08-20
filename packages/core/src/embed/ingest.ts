import postgres from "postgres";
import { DependencyError } from "../errors.ts";
import { defaultTeiEmbedder, type Embedder } from "./tei.ts";

const BATCH = 8;
export const CHUNK_EMBEDDINGS_INDEX = "chunk_embeddings_hnsw_idx";

export type EmbedRunResult = {
  embedded: number;
  skipped: number;
  modelName: string;
  dim: number;
  indexName: string;
};

export async function embedMissingChunks(
  databaseUrl: string,
  embedder: Embedder = defaultTeiEmbedder(),
): Promise<EmbedRunResult> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    let announced: { modelName: string };
    try {
      announced = await embedder.info();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new DependencyError(`tei unavailable: ${message}`);
    }
    const modelName = announced.modelName;
    const existingRows = await sql<{ existing: string }[]>`
      SELECT count(*)::text AS existing
      FROM chunk_embeddings
      WHERE model_name = ${modelName}
    `;
    const existing = existingRows[0]?.existing ?? "0";
    const pending = await sql<{ id: string; text: string }[]>`
      SELECT c.id::text AS id, c.text
      FROM chunks c
      LEFT JOIN chunk_embeddings e
        ON e.chunk_id = c.id AND e.model_name = ${modelName}
      WHERE e.chunk_id IS NULL
      ORDER BY c.id
    `;
    let embedded = 0;
    for (let offset = 0; offset < pending.length; offset += BATCH) {
      const batch = pending.slice(offset, offset + BATCH);
      const vectors = await embedder.embed(batch.map((row) => row.text));
      for (let i = 0; i < batch.length; i += 1) {
        const row = batch[i];
        const vector = vectors[i];
        if (row === undefined || vector === undefined) {
          throw new Error("embed batch alignment error");
        }
        if (vector.length !== embedder.dim) {
          throw new Error(`embedding dim ${vector.length} != ${embedder.dim}`);
        }
        const literal = `[${vector.join(",")}]`;
        await sql.unsafe(
          `INSERT INTO chunk_embeddings (chunk_id, model_name, dim, embedding)
           VALUES ($1::bigint, $2, $3, $4::vector)
           ON CONFLICT (chunk_id, model_name) DO NOTHING`,
          [row.id, modelName, embedder.dim, literal],
        );
        embedded += 1;
      }
    }
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${CHUNK_EMBEDDINGS_INDEX}
      ON chunk_embeddings USING hnsw (embedding vector_cosine_ops)
    `);
    return {
      embedded,
      skipped: Number(existing),
      modelName,
      dim: embedder.dim,
      indexName: CHUNK_EMBEDDINGS_INDEX,
    };
  } catch (error) {
    if (error instanceof DependencyError) {
      throw error;
    }
    throw error;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
