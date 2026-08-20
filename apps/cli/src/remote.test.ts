import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "@summer-sum/core";
import { createApiServer } from "../../api/src/server.ts";
import { EXIT } from "./exit.ts";

const root = repoRootFrom(import.meta.url);
loadEnvFiles(root);
const cliEntry = fileURLToPath(new URL("./index.ts", import.meta.url));
const TOKEN = "cli-remote-token";

function kbSync(args: string[], env: NodeJS.ProcessEnv): { status: number; stdout: string; stderr: string } {
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

function kbAsync(args: string[], env: NodeJS.ProcessEnv): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", cliEntry, ...args], {
      cwd: root,
      env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

async function withApi(fn: (base: string) => Promise<void>): Promise<void> {
  const server = createApiServer({
    databaseUrl: databaseUrl(),
    teiUrl: process.env.KB_TEI_URL ?? "http://localhost:8080",
    token: TOKEN,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const addr = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

test("remote unreachable host is exit 3 with a connection message", () => {
  const result = kbSync(["search", "产品力", "--json"], {
    ...process.env,
    KB_REMOTE_URL: "http://127.0.0.1:1",
    KB_REMOTE_TOKEN: TOKEN,
    KB_DATABASE_URL: "",
  });
  assert.equal(result.status, EXIT.unavailable, result.stderr);
  assert.match(result.stderr, /unreachable|connect|ECONNREFUSED|fetch/i);
});

test("remote rejected credential is distinguishable from a connection failure", async () => {
  await withApi(async (base) => {
    const result = await kbAsync(["search", "产品力", "--json"], {
      ...process.env,
      KB_REMOTE_URL: base,
      KB_REMOTE_TOKEN: "wrong-token",
      KB_DATABASE_URL: "",
    });
    assert.equal(result.status, EXIT.error, result.stderr);
    assert.match(result.stderr, /credential|unauthorized/i);
    assert.doesNotMatch(result.stderr, /unreachable/);
  });
});

test("remote search works without a local database url and matches local ids", async () => {
  await withApi(async (base) => {
    // Default limit is 10; hybrid rank at the cutoff can swap near-ties.
    // Compare the untruncated id set so local vs remote contract is what we assert.
    const local = kbSync(["search", "产品力", "--json", "--limit", "50"], {
      ...process.env,
      KB_REMOTE_URL: "",
      KB_DATABASE_URL: databaseUrl(),
    });
    assert.equal(local.status, EXIT.ok, local.stderr);
    const localIds = (JSON.parse(local.stdout) as { results: { id: string }[] }).results.map((row) => row.id).sort();

    const remote = await kbAsync(["search", "产品力", "--json", "--limit", "50"], {
      ...process.env,
      KB_REMOTE_URL: base,
      KB_REMOTE_TOKEN: TOKEN,
      KB_DATABASE_URL: "",
    });
    assert.equal(remote.status, EXIT.ok, remote.stderr);
    const remoteBody = JSON.parse(remote.stdout) as { results: Record<string, unknown>[] };
    assert.deepEqual(remoteBody.results.map((row) => String(row.id)).sort(), localIds);
    for (const card of remoteBody.results) {
      assert.equal(Object.hasOwn(card, "content"), false);
    }
  });
});

test("remote empty search is exit 0", async () => {
  await withApi(async (base) => {
    const result = await kbAsync(["search", "xyzzy-eval-no-hit-token", "--json"], {
      ...process.env,
      KB_REMOTE_URL: base,
      KB_REMOTE_TOKEN: TOKEN,
      KB_DATABASE_URL: "",
    });
    assert.equal(result.status, EXIT.ok, result.stderr);
    const body = JSON.parse(result.stdout) as { results: unknown[] };
    assert.equal(body.results.length, 0);
  });
});
