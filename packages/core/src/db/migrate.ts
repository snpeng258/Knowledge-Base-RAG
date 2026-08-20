import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "./env.ts";

const migrationsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

export async function runMigrations(url: string = databaseUrl()): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    const appliedRows = await sql<{ id: string }[]>`SELECT id FROM schema_migrations`;
    const applied = new Set(appliedRows.map((row) => row.id));
    const files = readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const body = readFileSync(resolve(migrationsDir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`INSERT INTO schema_migrations (id) VALUES (${file})`;
      });
    }
  } finally {
    await sql.end();
  }
}

async function main(): Promise<void> {
  loadEnvFiles(repoRootFrom(import.meta.url));
  try {
    await runMigrations();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`db:migrate failed: ${message}`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  await main();
}
