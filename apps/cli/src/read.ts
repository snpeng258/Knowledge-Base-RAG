import {
  DependencyError,
  getDocument,
  HybridRetriever,
  listTags,
  loadEnvFiles,
  rerankOptionsFromEnv,
  repoRootFrom,
  TeiEmbedder,
} from "@summer-sum/core";
import type { DocumentRecord, SearchQuery, SearchResponse } from "@summer-sum/core";

export type FacadeConfig = {
  databaseUrl: string;
  teiUrl: string;
};

export function loadFacadeConfig(overrides: Partial<FacadeConfig> = {}): FacadeConfig {
  loadEnvFiles(repoRootFrom(import.meta.url));
  return {
    databaseUrl: overrides.databaseUrl ?? process.env.KB_DATABASE_URL ?? "",
    teiUrl: overrides.teiUrl ?? process.env.KB_TEI_URL ?? "http://localhost:8080",
  };
}

export function requireDatabaseUrl(url: string): string {
  if (url.length === 0) {
    throw new DependencyError("KB_DATABASE_URL is not set");
  }
  return url;
}

export async function searchKnowledge(input: SearchQuery, cfg: FacadeConfig): Promise<SearchResponse> {
  const retriever = new HybridRetriever(
    requireDatabaseUrl(cfg.databaseUrl),
    new TeiEmbedder(cfg.teiUrl, process.env.KB_EMBED_MODEL ?? "BAAI/bge-m3"),
    rerankOptionsFromEnv(),
  );
  return retriever.search(input);
}

export async function getKnowledge(id: string, cfg: FacadeConfig): Promise<DocumentRecord> {
  return getDocument(id, requireDatabaseUrl(cfg.databaseUrl));
}

export async function listKnowledgeTags(
  cfg: FacadeConfig,
): Promise<{ slug: string; name: string; description: string | null }[]> {
  return listTags(requireDatabaseUrl(cfg.databaseUrl));
}
