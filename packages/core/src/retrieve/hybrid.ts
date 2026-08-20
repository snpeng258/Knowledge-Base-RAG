import postgres from "postgres";
import type { Embedder } from "../embed/types.ts";
import { cardRerankText, reorderCards } from "../rerank/order.ts";
import type { HybridRerankOptions, Reranker } from "../rerank/types.ts";
import { FulltextRetriever } from "./fulltext.ts";
import type { Retriever, SearchCard, SearchHit, SearchQuery, SearchResponse } from "./types.ts";

const VECTOR_LIMIT = 20;
const RRF_K = 60;
const VECTOR_MIN_SCORE = 0.42;

export class HybridRetriever implements Retriever {
  private readonly databaseUrl: string;
  private readonly embedder: Embedder;
  private readonly fulltext: FulltextRetriever;
  private readonly rerank: HybridRerankOptions;

  constructor(databaseUrl: string, embedder: Embedder, rerank: HybridRerankOptions = {}) {
    this.databaseUrl = databaseUrl;
    this.embedder = embedder;
    this.fulltext = new FulltextRetriever(databaseUrl);
    this.rerank = rerank;
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
    const reranked = await applyOptionalRerank(input.query, fused, this.rerank);
    return {
      query: input.query,
      stage: reranked.used ? "rerank" : "hybrid",
      degraded: false,
      total: reranked.cards.length,
      results: reranked.cards,
    };
  }
}

async function applyOptionalRerank(
  query: string,
  cards: SearchCard[],
  options: HybridRerankOptions,
): Promise<{ cards: SearchCard[]; used: boolean }> {
  const reranker: Reranker | undefined = options.reranker;
  if (options.enabled !== true || reranker === undefined || cards.length === 0) {
    return { cards, used: false };
  }
  const timeoutMs = options.timeoutMs ?? 3000;
  const candidateLimit = options.candidateLimit ?? 20;
  const head = cards.slice(0, candidateLimit);
  const tail = cards.slice(candidateLimit);
  try {
    const ranked = await withTimeout(
      reranker.rerank({
        query,
        texts: head.map(cardRerankText),
        timeoutMs,
      }),
      timeoutMs,
    );
    const inRange = ranked.some((row) => row.index >= 0 && row.index < head.length);
    if (!inRange) {
      return { cards, used: false };
    }
    return { cards: [...reorderCards(head, ranked), ...tail], used: true };
  } catch {
    // Read-path enhancement: keep recall order when the extra ranker is down.
    return { cards, used: false };
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  void promise.then(undefined, () => undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("rank timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
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
