import type { DocumentRecord } from "../documents/access.ts";
import type { SearchResponse } from "../retrieve/types.ts";

export function formatSearchJson(response: SearchResponse): unknown {
  return {
    query: response.query,
    stage: response.stage,
    degraded: response.degraded,
    total: response.total,
    results: response.results.map((card) => ({
      id: card.id,
      kind: card.kind,
      title: card.title,
      description: card.description,
      tags: card.tags,
      occurred_at: card.occurredAt,
      source_url: card.sourceUrl,
      score: card.score,
      hits: card.hits.map((hit) => ({
        chunk_ord: hit.chunkOrd,
        snippet: hit.snippet,
        char_start: hit.charStart,
        char_end: hit.charEnd,
        speaker: hit.speaker,
        ts_start: hit.tsStart,
      })),
    })),
  };
}

export function formatGetJson(doc: DocumentRecord): unknown {
  return {
    id: doc.id,
    kind: doc.kind,
    title: doc.title,
    description: doc.description,
    tags: doc.tags,
    occurred_at: doc.occurredAt,
    source: doc.source,
    content: doc.content,
  };
}
