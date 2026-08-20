export type RerankScore = {
  index: number;
  score: number;
};

export type Reranker = {
  rerank(input: { query: string; texts: string[]; timeoutMs: number }): Promise<RerankScore[]>;
};

export type HybridRerankOptions = {
  reranker?: Reranker;
  enabled?: boolean;
  timeoutMs?: number;
  candidateLimit?: number;
};
