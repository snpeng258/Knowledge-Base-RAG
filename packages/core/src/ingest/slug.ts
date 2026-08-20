import { basename, extname, resolve } from "node:path";
import { sha256 } from "./hash.ts";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuidLike(value: string): boolean {
  return UUID_SHAPE.test(value);
}

export function canonicalLocalPath(filePath: string): string {
  const absolute = resolve(filePath);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}

export function slugFromFilePath(filePath: string): string {
  const base = basename(filePath, extname(filePath));
  const slug = base
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const stem = slug.length > 0 ? slug : "untitled";
  const suffix = sha256(canonicalLocalPath(filePath)).slice(0, 8);
  return `file-${stem}-${suffix}`;
}
