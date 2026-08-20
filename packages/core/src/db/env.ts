import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DependencyError } from "../errors.ts";

export function repoRootFrom(moduleUrl: string): string {
  let dir = dirname(fileURLToPath(moduleUrl));
  while (!existsSync(resolve(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`could not find repo root from ${moduleUrl}`);
    }
    dir = parent;
  }
  return dir;
}

export function loadEnvFiles(root: string): void {
  for (const name of [".env", ".env.example"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) {
      continue;
    }
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq < 1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

export function databaseUrl(): string {
  const url = process.env.KB_DATABASE_URL;
  if (url === undefined || url.length === 0) {
    throw new DependencyError("KB_DATABASE_URL is not set");
  }
  return url;
}
