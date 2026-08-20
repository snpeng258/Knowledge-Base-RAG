import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { databaseUrl, loadEnvFiles, repoRootFrom, setDocumentTag } from "@summer-sum/core";
import { EXIT } from "./exit.ts";

const root = repoRootFrom(import.meta.url);
loadEnvFiles(root);
const fixture = resolve(root, "fixtures/sample-meeting.md");
const cliEntry = fileURLToPath(new URL("./index.ts", import.meta.url));

function kb(args: string[], env: NodeJS.ProcessEnv = process.env): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const spawned = spawnSync(process.execPath, ["--experimental-strip-types", cliEntry, ...args], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  return {
    status: spawned.status ?? 1,
    stdout: spawned.stdout,
    stderr: spawned.stderr,
  };
}

test("ingest url without a url is usage exit 2", () => {
  const result = kb(["ingest", "url"]);
  assert.equal(result.status, EXIT.usage);
});

test("ingest lark without token is usage exit 2", () => {
  const result = kb(["ingest", "lark"]);
  assert.equal(result.status, EXIT.usage);
});

test("missing search query is usage exit 2", () => {
  const result = kb(["search"]);
  assert.equal(result.status, EXIT.usage);
});

test("unknown get id is exit 4", () => {
  const result = kb(["get", "no-such-id"]);
  assert.equal(result.status, EXIT.notFound);
});

test("remote search without a url is usage exit 2", () => {
  const result = kb(["search", "x", "--remote"]);
  assert.equal(result.status, EXIT.usage);
  assert.match(result.stderr, /KB_REMOTE_URL/);
});

test("empty search results still exit 0", () => {
  const result = kb(["search", "xyzzy-eval-no-hit-token", "--json"]);
  assert.equal(result.status, EXIT.ok);
  const body = JSON.parse(result.stdout) as { results: unknown[] };
  assert.equal(body.results.length, 0);
});

test("ingest file, search, get, tags, and doctor work", async () => {
  const ingested = kb(["ingest", "file", fixture, "--json"]);
  assert.equal(ingested.status, EXIT.ok, ingested.stderr);
  const ingestBody = JSON.parse(ingested.stdout) as { document_id: string };
  assert.ok(ingestBody.document_id.length > 0);

  const jsonSearch = kb(["search", "产品力", "--json"]);
  assert.equal(jsonSearch.status, EXIT.ok, jsonSearch.stderr);
  const searchBody = JSON.parse(jsonSearch.stdout) as { results: { id: string }[] };
  assert.ok(searchBody.results.length > 0);
  assert.equal(Object.hasOwn(searchBody.results[0] ?? {}, "content"), false);

  const humanSearch = kb(["search", "产品力"]);
  assert.equal(humanSearch.status, EXIT.ok, humanSearch.stderr);
  const humanCount = humanSearch.stdout.split("\n").filter((line) => /^\S+\s+\[[^\]]+\]\s+/.test(line)).length;
  assert.equal(humanCount, searchBody.results.length);

  const got = kb(["get", ingestBody.document_id, "--json"]);
  assert.equal(got.status, EXIT.ok, got.stderr);
  const doc = JSON.parse(got.stdout) as { content: string };
  assert.ok(doc.content.length > 0);

  const tags = kb(["tags", "--json"]);
  assert.equal(tags.status, EXIT.ok, tags.stderr);
  const tagRows = JSON.parse(tags.stdout) as { slug: string; description: string | null }[];
  assert.ok(tagRows.length > 0);
  assert.ok(tagRows.every((row) => typeof row.description === "string" && row.description.length > 0));

  await setDocumentTag(databaseUrl(), ingestBody.document_id, "product-strategy", "human");
  const byTag = kb(["search", "产品力", "--tag", "product-strategy", "--json"]);
  assert.equal(byTag.status, EXIT.ok, byTag.stderr);
  const taggedBody = JSON.parse(byTag.stdout) as { results: { id: string }[] };
  assert.ok(taggedBody.results.some((row) => row.id === ingestBody.document_id));

  const proposals = kb(["tags", "proposals", "--json"]);
  assert.equal(proposals.status, EXIT.ok, proposals.stderr);
  assert.ok(Array.isArray(JSON.parse(proposals.stdout)));

  const doctor = kb(["doctor", "--json"]);
  assert.equal(doctor.status, EXIT.ok, doctor.stderr);
  const report = JSON.parse(doctor.stdout) as {
    ok: boolean;
    items: { name: string; required: boolean; status: string }[];
  };
  assert.equal(report.ok, true);
  const names = report.items.map((item) => item.name);
  assert.ok(names.includes("ollama"));
  assert.ok(names.includes("ollama_model"));
  assert.ok(names.includes("tei"));
  assert.ok(names.includes("tei_model"));
  const optional = report.items.filter((item) => !item.required);
  assert.ok(optional.every((item) => item.status === "ok" || item.status === "degraded"));

  const searchWithoutOllama = kb(["search", "产品力"], {
    ...process.env,
    KB_OLLAMA_URL: "http://127.0.0.1:1",
  });
  assert.equal(searchWithoutOllama.status, EXIT.ok, searchWithoutOllama.stderr);

  const searchWithoutTei = kb(["search", "产品力", "--json"], {
    ...process.env,
    KB_TEI_URL: "http://127.0.0.1:1",
  });
  assert.equal(searchWithoutTei.status, EXIT.ok, searchWithoutTei.stderr);
  const degradedBody = JSON.parse(searchWithoutTei.stdout) as {
    stage: string;
    degraded: boolean;
    results: unknown[];
  };
  assert.equal(degradedBody.stage, "fulltext");
  assert.equal(degradedBody.degraded, true);
  assert.ok(degradedBody.results.length > 0);

  const searchRerankDown = kb(["search", "产品力", "--json"], {
    ...process.env,
    KB_RERANK_ENABLED: "1",
    KB_RERANK_URL: "http://127.0.0.1:1",
    KB_RERANK_TIMEOUT_MS: "400",
  });
  assert.equal(searchRerankDown.status, EXIT.ok, searchRerankDown.stderr);
  const rerankDownBody = JSON.parse(searchRerankDown.stdout) as {
    stage: string;
    results: unknown[];
  };
  assert.notEqual(rerankDownBody.stage, "rerank");
  assert.ok(rerankDownBody.results.length > 0);
});

test("embed with unreachable tei is exit 3", () => {
  const result = kb(["embed", "--tei-url", "http://127.0.0.1:1"]);
  assert.equal(result.status, EXIT.unavailable, result.stderr);
  assert.match(result.stderr, /tei|unavailable|ECONNREFUSED|fetch/i);
});

test("doctor with unreachable ollama is not exit 3", () => {
  const result = kb(["doctor", "--json"], {
    ...process.env,
    KB_OLLAMA_URL: "http://127.0.0.1:1",
  });
  assert.equal(result.status, EXIT.ok, result.stderr);
  const report = JSON.parse(result.stdout) as {
    items: { name: string; status: string }[];
  };
  const ollama = report.items.find((item) => item.name === "ollama");
  assert.equal(ollama?.status, "degraded");
});

test("unreachable database is exit 3", () => {
  const result = kb(["search", "x"], {
    ...process.env,
    KB_DATABASE_URL: "postgresql://kb:kb@127.0.0.1:1/kb",
  });
  assert.equal(result.status, EXIT.unavailable);
  assert.match(result.stderr, /search failed|ECONNREFUSED|unavailable|connect/i);
});

test("database-url flag overrides env", () => {
  const result = kb(["search", "x", "--database-url", "postgresql://kb:kb@127.0.0.1:1/kb"]);
  assert.equal(result.status, EXIT.unavailable);
});

test("doctor with empty database url does not use libpq defaults", () => {
  const result = kb(["doctor", "--json"], { ...process.env, KB_DATABASE_URL: "" });
  assert.equal(result.status, EXIT.unavailable);
  assert.match(result.stdout, /KB_DATABASE_URL is not set/);
});

test("core test script does not depend on apps/cli", async () => {
  const { readFile } = await import("node:fs/promises");
  const corePkg = JSON.parse(await readFile(resolve(root, "packages/core/package.json"), "utf8")) as {
    scripts: { test: string };
  };
  assert.doesNotMatch(corePkg.scripts.test, /apps\/cli|@summer-sum\/cli/);
});

test("pnpm kb forwards arguments including --json", () => {
  databaseUrl();
  const spawned = spawnSync(process.execPath, [
    "--experimental-strip-types",
    resolve(root, "apps/cli/src/index.ts"),
    "search",
    "xyzzy-eval-no-hit-token",
    "--json",
  ], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(spawned.status, 0, spawned.stderr);
  const body = JSON.parse(spawned.stdout) as { results: unknown[] };
  assert.equal(body.results.length, 0);

  const viaPnpm = spawnSync("pnpm", ["kb", "search", "xyzzy-eval-no-hit-token", "--json"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
  assert.equal(viaPnpm.status, 0, `${viaPnpm.stderr}\n${viaPnpm.stdout}`);
  const start = viaPnpm.stdout.indexOf("{");
  const end = viaPnpm.stdout.lastIndexOf("}");
  assert.ok(start >= 0 && end > start, viaPnpm.stdout);
  const pnpmBody = JSON.parse(viaPnpm.stdout.slice(start, end + 1)) as { results: unknown[] };
  assert.equal(pnpmBody.results.length, 0);
});
