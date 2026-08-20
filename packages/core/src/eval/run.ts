import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { ingestLocalFile } from "../ingest/file.ts";
import { FulltextRetriever } from "../retrieve/fulltext.ts";
import { formatEvalHuman, formatEvalJson } from "./format.ts";
import { classifyCase, expectedHit, summarize } from "./types.ts";
import type { CaseResult, CorpusTag, EvalReport, EvalSuite } from "./types.ts";

const casesPath = fileURLToPath(new URL("./cases.json", import.meta.url));

async function attachTags(databaseUrl: string, documentId: string, tags: CorpusTag[]): Promise<void> {
  if (tags.length === 0) {
    return;
  }
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    for (const tag of tags) {
      await sql`INSERT INTO tags (slug, name) VALUES (${tag.slug}, ${tag.name}) ON CONFLICT (slug) DO NOTHING`;
      await sql`
        INSERT INTO document_tags (document_id, tag_slug, source)
        VALUES (${documentId}, ${tag.slug}, 'human')
        ON CONFLICT (document_id, tag_slug) DO NOTHING
      `;
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function runEval(url: string, root: string): Promise<EvalReport> {
  await runMigrations(url);
  const suite = JSON.parse(await readFile(casesPath, "utf8")) as EvalSuite;
  const idByFixture = new Map<string, string>();
  for (const entry of suite.corpus) {
    const ingested = await ingestLocalFile(resolve(root, entry.path), url);
    idByFixture.set(entry.path, ingested.documentId);
    await attachTags(url, ingested.documentId, entry.tags);
  }

  const retriever = new FulltextRetriever(url);
  const results: CaseResult[] = [];
  for (const evalCase of suite.cases) {
    const expectedIds = evalCase.expectedFixtures.map((path) => {
      const id = idByFixture.get(path);
      if (id === undefined) {
        throw new Error(`eval corpus is missing fixture ${path}`);
      }
      return id;
    });
    const response = await retriever.search({
      query: evalCase.query,
      ...(evalCase.tags !== undefined && evalCase.tags.length > 0 ? { tags: evalCase.tags } : {}),
    });
    const actualIds = response.results.map((card) => card.id);
    results.push({
      id: evalCase.id,
      category: evalCase.category,
      query: evalCase.query,
      expect: evalCase.expect,
      status: classifyCase(evalCase.expect, expectedHit(expectedIds, actualIds)),
      expectedIds,
      actualIds,
      reason: evalCase.reason ?? null,
    });
  }
  return summarize(results);
}

async function main(): Promise<void> {
  const root = repoRootFrom(import.meta.url);
  loadEnvFiles(root);
  const json = process.argv.includes("--json");
  const report = await runEval(databaseUrl(), root);
  if (json) {
    process.stdout.write(`${JSON.stringify(formatEvalJson(report), null, 2)}\n`);
  } else {
    process.stdout.write(formatEvalHuman(report));
  }
}

const isDirectRun =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isDirectRun) {
  await main();
}
