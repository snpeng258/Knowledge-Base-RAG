import { sha256 } from "./hash.ts";

const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$)/i;

export function normalizeUrl(raw: string): string {
  const parsed = new URL(raw.trim());
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING.test(key)) {
      parsed.searchParams.delete(key);
    }
  }
  parsed.searchParams.sort();
  let path = parsed.pathname;
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  const search = parsed.searchParams.toString();
  const auth =
    parsed.username.length > 0
      ? `${parsed.username}${parsed.password.length > 0 ? `:${parsed.password}` : ""}@`
      : "";
  const host = parsed.port.length > 0 ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  return `${parsed.protocol}//${auth}${host}${path === "/" ? "" : path}${search.length > 0 ? `?${search}` : ""}`;
}

export function linkDocumentId(sourceRef: string): string {
  return `link-${sha256(sourceRef).slice(0, 8)}`;
}
