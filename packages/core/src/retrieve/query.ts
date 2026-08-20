import { tokenizeForSearch } from "../ingest/tokenize.ts";

export { tokenizeForSearch };

export function queryTokens(text: string): string[] {
  return tokenizeForSearch(text)
    .split(" ")
    .filter((token) => token.length > 0);
}

export function toTsQuery(text: string): string {
  return queryTokens(text)
    .map((token) => `'${token.replace(/'/g, "")}'`)
    .filter((token) => token.length > 2)
    .join(" & ");
}
