import postgres from "postgres";
import type { Embedder } from "../embed/types.ts";
import { FulltextRetriever } from "./fulltext.ts";
import type { Retriever, SearchCard, SearchHit, SearchQuery, SearchResponse } from "./types.ts";

const VECTOR_LIMIT = 20;
const RRF_K = 60;
const VECTOR_MIN_SCORE = 0.42;

export class HybridRetriever implements Retriever {
  private readonly databaseUrl: string;
  private readonly embedder: Embedder;
  private readonly fulltext: FulltextRetriever;

  constructor(databaseUrl: string, embedder: Embedder) {
    this.databaseUrl = databaseUrl;
    this.embedder = embedder;
    this.fulltext = new FulltextRetriever(databaseUrl);
  }

  async search(input: SearchQuery): Promise<SearchResponse> {
    const lexical = await this.fulltext.search(input);
    let modelName: string;
    let queryVector: number[];
    try {
      const info = await this.embedder.info();
      modelName = info.modelName;
      const vectors = await this.embedder.embed([input.query]);
      const first = vectors[0];
      if (first === undefined) {
        return { ...lexical, stage: "fulltext", degraded: true };
      }
      queryVector = first;
    } catch {
      return {
        ...lexical,
        stage: "fulltext",
        degraded: true,
      };
    }
    const vectorCards = await recallByVector(this.databaseUrl, input, modelName, queryVector);
    const fused = fuseRrf(lexical.results, vectorCards, input.limit ?? 10);
    return {
      query: input.query,
      stage: "hybrid",
      degraded: false,
      total: fused.length,
      results: fused,
    };
  }
}

function fuseRrf(lexical: SearchCard[], vectorCards: SearchCard[], limit: number): SearchCard[] {
  const merged = new Map<string, { card: SearchCard; score: number }>();
  lexical.forEach((card, index) => {
    merged.set(card.id, { card: { ...card, score: 1 / (RRF_K + index + 1) }, score: 1 / (RRF_K + index + 1) });
  });
  vectorCards.forEach((card, index) => {
    const add = 1 / (RRF_K + index + 1);
    const existing = merged.get(card.id);
    if (existing === undefined) {
      merged.set(card.id, { card: { ...card, score: add }, score: add });
      return;
    }
    existing.score += add;
    existing.card = {
      ...existing.card,
      score: existing.score,
      hits: existing.card.hits.length > 0 ? existing.card.hits : card.hits,
    };
  });
  return [...merged.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((row) => row.card);
}

async function recallByVector(
  databaseUrl: string,
  input: SearchQuery,
  modelName: string,
  queryVector: number[],
): Promise<SearchCard[]> {
  const requiredTags = input.tags ?? [];
  const literal = `[${queryVector.join(",")}]`;
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    const rows = await sql.unsafe<
      {
        id: string;
        kind: string;
        title: string;
        description: string | null;
        occurred_at: Date | null;
        source_url: string | null;
        score: number;
        ord: number;
        text: string;
        char_start: number;
        char_end: number;
        speaker: string | null;
        ts_start: number | null;
      }[]
    >(
      `SELECT
          d.id,
          d.kind,
          d.title,
          d.description,
          d.occurred_at,
          d.source_url,
          (1 - (e.embedding <=> $1::vector)) AS score,
          c.ord,
          c.text,
          c.char_start,
          c.char_end,
          c.speaker,
          c.ts_start
        FROM chunk_embeddings e
        JOIN chunks c ON c.id = e.chunk_id
        JOIN documents d ON d.id = c.document_id
        WHERE e.model_name = $2
          AND ($3::text IS NULL OR d.kind = $3)
          AND ($4::timestamptz IS NULL OR d.occurred_at >= $4)
          AND ($5::timestamptz IS NULL OR d.occurred_at <= $5)
          AND (
            $6::int = 0
            OR (
              SELECT count(DISTINCT tag_slug)
              FROM document_tags
              WHERE document_id = d.id AND tag_slug = ANY($7::text[])
            ) = $6::int
          )
        ORDER BY e.embedding <=> $1::vector
        LIMIT $8`,
      [
        literal,
        modelName,
        input.kind ?? null,
        input.since ?? null,
        input.until ?? null,
        requiredTags.length,
        requiredTags,
        VECTOR_LIMIT,
      ],
    );

    const byDoc = new Map<string, SearchCard>();
    for (const row of rows) {
      if (Number(row.score) < VECTOR_MIN_SCORE) {
        continue;
      }
      if (byDoc.has(row.id)) {
        continue;
      }
      const tagRows = await sql<{ slug: string }[]>`
        SELECT tag_slug AS slug FROM document_tags WHERE document_id = ${row.id}
      `;
      const hit: SearchHit = {
        chunkOrd: row.ord,
        snippet: row.text.slice(0, 180),
        charStart: row.char_start,
        charEnd: Math.min(row.char_end, row.char_start + 180),
        speaker: row.speaker,
        tsStart: row.ts_start,
      };
      byDoc.set(row.id, {
        id: row.id,
        kind: row.kind,
        title: row.title,
        description: row.description,
        tags: tagRows.map((tag) => tag.slug),
        occurredAt: row.occurred_at === null ? null : row.occurred_at.toISOString(),
        sourceUrl: row.source_url,
        score: Number(row.score),
        hits: [hit],
      });
    }
    const cards = [...byDoc.values()].filter((card) => {
      if (input.kind !== undefined && card.kind !== input.kind) {
        return false;
      }
      return requiredTags.every((tag) => card.tags.includes(tag));
    });
    return cards;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
