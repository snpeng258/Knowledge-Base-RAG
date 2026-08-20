import { HttpReranker } from "./http.ts";
import type { HybridRerankOptions } from "./types.ts";

export function rerankOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): HybridRerankOptions {
  const raw = env.KB_RERANK_ENABLED ?? "0";
  const enabled = raw === "1" || raw.toLowerCase() === "true";
  return {
    reranker: new HttpReranker(env.KB_RERANK_URL ?? "http://localhost:8082"),
    enabled,
    timeoutMs: parsePositiveInt(env.KB_RERANK_TIMEOUT_MS, 3000),
    candidateLimit: parsePositiveInt(env.KB_RERANK_CANDIDATES, 20),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}
