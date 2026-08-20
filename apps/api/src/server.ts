import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  DependencyError,
  formatGetJson,
  formatSearchJson,
  getDocument,
  HybridRetriever,
  listTags,
  NotFoundError,
  rerankOptionsFromEnv,
  TeiEmbedder,
} from "@summer-sum/core";
import type { SearchQuery } from "@summer-sum/core";
import { bearerAuthorized } from "./auth.ts";

export type ApiConfig = {
  databaseUrl: string;
  teiUrl: string;
  token: string;
};

export function createApiServer(cfg: ApiConfig): Server {
  return createServer((req, res) => {
    void handleRequest(req, res, cfg);
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, cfg: ApiConfig): Promise<void> {
  try {
    const host = req.headers.host ?? "127.0.0.1";
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed" });
      return;
    }
    if (!bearerAuthorized(req.headers.authorization, cfg.token)) {
      sendJson(res, 401, { error: "unauthorized: invalid or missing credential" });
      return;
    }
    if (url.pathname === "/tags") {
      sendJson(res, 200, await listTags(requireDatabase(cfg.databaseUrl)));
      return;
    }
    if (url.pathname === "/search") {
      const query = url.searchParams.get("query") ?? "";
      if (query.length === 0) {
        sendJson(res, 400, { error: "query is required" });
        return;
      }
      const retriever = new HybridRetriever(
        requireDatabase(cfg.databaseUrl),
        new TeiEmbedder(cfg.teiUrl, process.env.KB_EMBED_MODEL ?? "BAAI/bge-m3"),
        rerankOptionsFromEnv(),
      );
      sendJson(res, 200, formatSearchJson(await retriever.search(searchQueryFromUrl(query, url.searchParams))));
      return;
    }
    const documentMatch = /^\/documents\/([^/]+)$/.exec(url.pathname);
    if (documentMatch !== null && documentMatch[1] !== undefined) {
      const doc = await getDocument(decodeURIComponent(documentMatch[1]), requireDatabase(cfg.databaseUrl));
      sendJson(res, 200, formatGetJson(doc));
      return;
    }
    sendJson(res, 404, { error: "not found" });
  } catch (error) {
    if (error instanceof NotFoundError) {
      sendJson(res, 404, { error: error.message });
      return;
    }
    if (error instanceof DependencyError) {
      sendJson(res, 503, { error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    sendJson(res, 500, { error: message });
  }
}

function searchQueryFromUrl(query: string, params: URLSearchParams): SearchQuery {
  const input: SearchQuery = { query };
  const tags = params.getAll("tag");
  if (tags.length > 0) {
    input.tags = tags;
  }
  const kind = params.get("kind");
  if (kind !== null && kind.length > 0) {
    input.kind = kind;
  }
  const since = params.get("since");
  if (since !== null && since.length > 0) {
    input.since = new Date(since);
  }
  const until = params.get("until");
  if (until !== null && until.length > 0) {
    input.until = new Date(until);
  }
  const limitRaw = params.get("limit");
  if (limitRaw !== null && limitRaw.length > 0) {
    const limit = Number(limitRaw);
    if (Number.isInteger(limit) && limit >= 1) {
      input.limit = limit;
    }
  }
  return input;
}

function requireDatabase(url: string): string {
  if (url.length === 0) {
    throw new DependencyError("KB_DATABASE_URL is not set");
  }
  return url;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = `${JSON.stringify(body)}\n`;
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}
