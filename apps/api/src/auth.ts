import { timingSafeEqual } from "node:crypto";

export function bearerAuthorized(header: string | undefined, expected: string): boolean {
  if (expected.length === 0 || header === undefined) {
    return false;
  }
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    return false;
  }
  const provided = header.slice(prefix.length);
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}
