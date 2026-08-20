import type { RerankScore, Reranker } from "./types.ts";

export class HttpReranker implements Reranker {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async rerank(input: { query: string; texts: string[]; timeoutMs: number }): Promise<RerankScore[]> {
    if (input.texts.length === 0) {
      return [];
    }
    const response = await fetch(`${this.baseUrl}/rerank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: input.query, texts: input.texts }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`rerank http ${response.status} at ${this.baseUrl}`);
    }
    const payload: unknown = await response.json();
    return parseRerankPayload(payload);
  }
}

export function parseRerankPayload(value: unknown): RerankScore[] {
  const rows = unwrapRerankRows(value);
  return rows.map((row) => {
    if (typeof row !== "object" || row === null) {
      throw new Error("rerank row is not an object");
    }
    const record = row as Record<string, unknown>;
    if (typeof record.index !== "number" || typeof record.score !== "number") {
      throw new Error("rerank row is missing index or score");
    }
    return { index: record.index, score: record.score };
  });
}

function unwrapRerankRows(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (typeof value === "object" && value !== null && Array.isArray((value as { results?: unknown }).results)) {
    return (value as { results: unknown[] }).results;
  }
  throw new Error("rerank response is not a result list");
}
