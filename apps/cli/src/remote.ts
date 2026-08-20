import { DependencyError, NotFoundError } from "@summer-sum/core";
import type { SearchQuery } from "@summer-sum/core";

export class RemoteAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteAuthError";
  }
}

export type RemoteConfig = {
  remoteUrl: string;
  token: string;
};

export async function remoteSearch(input: SearchQuery, cfg: RemoteConfig): Promise<unknown> {
  const url = new URL("/search", cfg.remoteUrl);
  url.searchParams.set("query", input.query);
  for (const tag of input.tags ?? []) {
    url.searchParams.append("tag", tag);
  }
  if (input.kind !== undefined) {
    url.searchParams.set("kind", input.kind);
  }
  if (input.since !== undefined) {
    url.searchParams.set("since", input.since.toISOString());
  }
  if (input.until !== undefined) {
    url.searchParams.set("until", input.until.toISOString());
  }
  if (input.limit !== undefined) {
    url.searchParams.set("limit", String(input.limit));
  }
  return requestJson(url, cfg.token);
}

export async function remoteGet(id: string, cfg: RemoteConfig): Promise<unknown> {
  return requestJson(new URL(`/documents/${encodeURIComponent(id)}`, cfg.remoteUrl), cfg.token);
}

export async function remoteTags(cfg: RemoteConfig): Promise<unknown> {
  return requestJson(new URL("/tags", cfg.remoteUrl), cfg.token);
}

async function requestJson(url: URL, token: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DependencyError(`remote api unreachable at ${url.origin}: ${message}`);
  }
  if (response.status === 401) {
    throw new RemoteAuthError("remote api rejected the credential (unauthorized)");
  }
  if (response.status === 404) {
    const payload = await readError(response);
    throw new NotFoundError(payload);
  }
  if (!response.ok) {
    const payload = await readError(response);
    throw new DependencyError(`remote api http ${response.status}: ${payload}`);
  }
  return response.json();
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string") {
      return (body as { error: string }).error;
    }
  } catch {
    return response.statusText;
  }
  return response.statusText;
}
