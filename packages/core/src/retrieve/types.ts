export type SearchQuery = {
  query: string;
  tags?: string[];
  kind?: string;
  since?: Date;
  until?: Date;
  limit?: number;
};

export type SearchHit = {
  chunkOrd: number;
  snippet: string;
  charStart: number;
  charEnd: number;
  speaker: string | null;
  tsStart: number | null;
};

export type SearchCard = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  tags: string[];
  occurredAt: string | null;
  sourceUrl: string | null;
  score: number;
  hits: SearchHit[];
};

export type SearchResponse = {
  query: string;
  stage: "fulltext" | "vector" | "hybrid";
  degraded: boolean;
  total: number;
  results: SearchCard[];
};

export interface Retriever {
  search(input: SearchQuery): Promise<SearchResponse>;
}
