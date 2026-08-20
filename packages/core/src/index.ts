export const PACKAGE_NAME = "@summer-sum/core";

export * from "./db/schema.ts";
export { runMigrations } from "./db/migrate.ts";
export { ingestLocalFile } from "./ingest/file.ts";
export type { IngestFileResult } from "./ingest/file.ts";
export { FulltextRetriever } from "./retrieve/fulltext.ts";
export type { Retriever, SearchQuery, SearchResponse } from "./retrieve/types.ts";
