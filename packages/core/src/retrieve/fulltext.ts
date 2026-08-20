import postgres from "postgres";
import { toDependencyError } from "../errors.ts";
import { queryTokens, toTsQuery } from "./query.ts";
import type { Retriever, SearchCard, SearchHit, SearchQuery, SearchResponse } from "./types.ts";

const DEFAULT_LIMIT = 10;
const SNIPPET_CHARS = 180;

export class FulltextRetriever implements Retriever {
  private readonly databaseUrl: string;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  async search(input: SearchQuery): Promise<SearchResponse> {
    const tsQuery = toTsQuery(input.query);
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (tsQuery.length === 0) {
      return { query: input.query, stage: "fulltext", degraded: false, total: 0, results: [] };
    }

    const requiredTags = input.tags ?? [];
    const sql = postgres(this.databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
    try {
      const rows = await sql<
        {
          id: string;
          kind: string;
          title: string;
          description: string | null;
          occurred_at: Date | null;
          source_url: string | null;
          score: number;
        }[]
      >`
        SELECT
          d.id,
          d.kind,
          d.title,
          d.description,
          d.occurred_at,
          d.source_url,
          ts_rank(d.search_vector, to_tsquery('simple', ${tsQuery})) AS score
        FROM documents d
        WHERE d.search_vector @@ to_tsquery('simple', ${tsQuery})
          AND (${input.kind ?? null}::text IS NULL OR d.kind = ${input.kind ?? null})
          AND (${input.since ?? null}::timestamptz IS NULL OR d.occurred_at >= ${input.since ?? null})
          AND (${input.until ?? null}::timestamptz IS NULL OR d.occurred_at <= ${input.until ?? null})
          AND (
            ${requiredTags.length} = 0
            OR (
              SELECT count(DISTINCT tag_slug)
              FROM document_tags
              WHERE document_id = d.id AND tag_slug = ANY(${requiredTags})
            ) = ${requiredTags.length}
          )
        ORDER BY score DESC, d.occurred_at DESC NULLS LAST
        LIMIT ${limit}
      `;

      const results: SearchCard[] = [];
      for (const row of rows) {
        const tagRows = await sql<{ slug: string }[]>`
          SELECT tag_slug AS slug FROM document_tags WHERE document_id = ${row.id}
        `;
        results.push({
          id: row.id,
          kind: row.kind,
          title: row.title,
          description: row.description,
          tags: tagRows.map((tag) => tag.slug),
          occurredAt: row.occurred_at === null ? null : row.occurred_at.toISOString(),
          sourceUrl: row.source_url,
          score: Number(row.score),
          hits: await loadHits(sql, row.id, tsQuery, input.query),
        });
      }

      return {
        query: input.query,
        stage: "fulltext",
        degraded: false,
        total: results.length,
        results,
      };
    } catch (error) {
      toDependencyError(error, "search failed");
    } finally {
      await sql.end({ timeout: 1 });
    }
  }
}

async function loadHits(
  sql: postgres.Sql,
  documentId: string,
  tsQuery: string,
  queryText: string,
): Promise<SearchHit[]> {
  const rows = await sql<
    {
      ord: number;
      text: string;
      char_start: number;
      char_end: number;
      speaker: string | null;
      ts_start: number | null;
    }[]
  >`
    SELECT ord, text, char_start, char_end, speaker, ts_start
    FROM chunks
    WHERE document_id = ${documentId}
      AND search_vector @@ to_tsquery('simple', ${tsQuery})
    ORDER BY ts_rank(search_vector, to_tsquery('simple', ${tsQuery})) DESC, ord
    LIMIT 3
  `;
  return rows.map((row) => {
    const window = snippetWindow(row.text, queryText);
    return {
      chunkOrd: row.ord,
      snippet: window.snippet,
      charStart: row.char_start + window.localStart,
      charEnd: row.char_start + window.localEnd,
      speaker: row.speaker,
      tsStart: row.ts_start,
    };
  });
}

function snippetWindow(
  text: string,
  queryText: string,
  width = SNIPPET_CHARS,
): { snippet: string; localStart: number; localEnd: number } {
  const tokens = queryTokens(queryText);
  let pivot = 0;
  for (const token of tokens) {
    const found = text.indexOf(token);
    if (found >= 0) {
      pivot = found;
      break;
    }
  }
  const half = Math.floor(width / 2);
  const localStart = Math.max(0, pivot - half);
  const localEnd = Math.min(text.length, localStart + width);
  const prefix = localStart > 0 ? "…" : "";
  const suffix = localEnd < text.length ? "…" : "";
  return {
    snippet: `${prefix}${text.slice(localStart, localEnd)}${suffix}`,
    localStart,
    localEnd,
  };
}
