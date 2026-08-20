import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "@summer-sum/core";
import { MCP_READ_TOOLS, invokeMcpReadTool } from "./mcp.ts";

const root = repoRootFrom(import.meta.url);
loadEnvFiles(root);
const cliEntry = fileURLToPath(new URL("./index.ts", import.meta.url));

function kbSearchJson(query: string): { ids: string[]; body: { results: Record<string, unknown>[] } } {
  const spawned = spawnSync(process.execPath, ["--experimental-strip-types", cliEntry, "search", query, "--json"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  assert.equal(spawned.status, 0, spawned.stderr);
  const body = JSON.parse(spawned.stdout) as { results: { id: string }[] & Record<string, unknown>[] };
  return { ids: body.results.map((row) => row.id).sort(), body };
}

test("mcp exposes exactly three read tools", async () => {
  assert.deepEqual([...MCP_READ_TOOLS].sort(), ["get", "search", "tags"]);
  const src = await readFile(new URL("./mcp.ts", import.meta.url), "utf8");
  for (const name of MCP_READ_TOOLS) {
    assert.match(src, new RegExp(`registerTool\\(\\s*"${name}"`));
  }
  assert.equal([...src.matchAll(/registerTool\(/g)].length, MCP_READ_TOOLS.length);
});

test("mcp search matches cli json ids and omits content", async () => {
  const cli = kbSearchJson("产品力");
  const mcp = await invokeMcpReadTool("search", { query: "产品力" }, {
    databaseUrl: databaseUrl(),
    teiUrl: process.env.KB_TEI_URL ?? "http://localhost:8080",
  });
  assert.equal(mcp.isError, false, mcp.text);
  const payload = JSON.parse(mcp.text) as { results: Record<string, unknown>[] };
  assert.deepEqual(payload.results.map((row) => String(row.id)).sort(), cli.ids);
  const firstMcp = payload.results[0];
  const firstCli = cli.body.results[0];
  if (firstMcp !== undefined && firstCli !== undefined) {
    assert.deepEqual(Object.keys(firstMcp).sort(), Object.keys(firstCli).sort());
  }
  for (const card of payload.results) {
    assert.equal(Object.hasOwn(card, "content"), false);
  }
});

test("mcp empty search is success with an empty list, not an error", async () => {
  const mcp = await invokeMcpReadTool("search", { query: "xyzzy-eval-no-hit-token" }, {
    databaseUrl: databaseUrl(),
    teiUrl: process.env.KB_TEI_URL ?? "http://localhost:8080",
  });
  assert.equal(mcp.isError, false, mcp.text);
  const payload = JSON.parse(mcp.text) as { results: unknown[] };
  assert.deepEqual(payload.results, []);
});

test("mcp get missing id is an error, not an empty document", async () => {
  const mcp = await invokeMcpReadTool("get", { id: "no-such-id" }, {
    databaseUrl: databaseUrl(),
    teiUrl: process.env.KB_TEI_URL ?? "http://localhost:8080",
  });
  assert.equal(mcp.isError, true);
  assert.match(mcp.text, /not found/i);
  assert.doesNotMatch(mcp.text, /"content"\s*:\s*""/);
});

test("mcp search with a dead database is a diagnostic error", async () => {
  const mcp = await invokeMcpReadTool("search", { query: "产品力" }, {
    databaseUrl: "postgresql://kb:kb@127.0.0.1:1/kb",
    teiUrl: "http://127.0.0.1:1",
  });
  assert.equal(mcp.isError, true, mcp.text);
  assert.match(mcp.text, /search failed|ECONNREFUSED|unavailable|connect|KB_DATABASE_URL/i);
  assert.doesNotMatch(mcp.text, /"results"\s*:\s*\[\s*\]/);
});

test("mcp facade files do not contain retrieval query logic", async () => {
  const files = ["mcp.ts", "read.ts"];
  for (const name of files) {
    const src = await readFile(new URL(`./${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /tsquery|plainto_tsquery|tokenizeForSearch|<=>/);
  }
});
