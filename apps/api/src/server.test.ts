import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "@summer-sum/core";
import { createApiServer } from "./server.ts";

loadEnvFiles(repoRootFrom(import.meta.url));
const TOKEN = "test-api-token";

async function withServer(
  fn: (base: string) => Promise<void>,
  cfg: { databaseUrl: string; token: string } = { databaseUrl: databaseUrl(), token: TOKEN },
): Promise<void> {
  const server = createApiServer({
    databaseUrl: cfg.databaseUrl,
    teiUrl: process.env.KB_TEI_URL ?? "http://localhost:8080",
    token: cfg.token,
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

test("health is public and ok", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { ok: boolean };
    assert.equal(body.ok, true);
  });
});

test("search without a credential is unauthorized", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/search?query=${encodeURIComponent("产品力")}`);
    assert.equal(response.status, 401);
  });
});

test("search with a bad credential is unauthorized", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/search?query=${encodeURIComponent("产品力")}`, {
      headers: { authorization: "Bearer wrong-token" },
    });
    assert.equal(response.status, 401);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /unauthorized|credential/i);
  });
});

test("search json matches the read contract and omits content", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/search?query=${encodeURIComponent("产品力")}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { results: Record<string, unknown>[] };
    assert.ok(Array.isArray(body.results));
    for (const card of body.results) {
      assert.equal(Object.hasOwn(card, "content"), false);
      assert.equal(Object.hasOwn(card, "occurred_at"), true);
    }
  });
});

test("empty search is 200 with an empty list", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/search?query=${encodeURIComponent("xyzzy-eval-no-hit-token")}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { results: unknown[] };
    assert.equal(body.results.length, 0);
  });
});

test("missing document is 404 not an empty body", async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/documents/no-such-id`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error: string };
    assert.match(body.error, /not found/i);
  });
});

test("tags lists controlled vocabulary without a credential being optional", async () => {
  await withServer(async (base) => {
    const denied = await fetch(`${base}/tags`);
    assert.equal(denied.status, 401);

    const response = await fetch(`${base}/tags`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { slug: string; name: string }[];
    assert.ok(Array.isArray(body));
    assert.ok(body.length > 0);
    assert.equal(typeof body[0]?.slug, "string");
    assert.equal(typeof body[0]?.name, "string");
  });
});

test("get returns the document body for a search hit", async () => {
  await withServer(async (base) => {
    const search = await fetch(`${base}/search?query=${encodeURIComponent("产品力")}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(search.status, 200);
    const cards = (await search.json()) as { results: { id: string }[] };
    const id = cards.results[0]?.id;
    assert.ok(id);

    const response = await fetch(`${base}/documents/${encodeURIComponent(id)}`, {
      headers: { authorization: `Bearer ${TOKEN}` },
    });
    assert.equal(response.status, 200);
    const body = (await response.json()) as { id: string; content?: string };
    assert.equal(body.id, id);
    assert.equal(typeof body.content, "string");
    assert.ok((body.content ?? "").length > 0);
  });
});
