import assert from "node:assert/strict";
import { test } from "node:test";
import { HttpReranker, parseRerankPayload } from "./http.ts";

test("parseRerankPayload reads a top-level result array", () => {
  const rows = parseRerankPayload([
    { index: 1, score: 0.2 },
    { index: 0, score: 0.9 },
  ]);
  assert.deepEqual(rows, [
    { index: 1, score: 0.2 },
    { index: 0, score: 0.9 },
  ]);
});

test("parseRerankPayload reads a wrapped results field", () => {
  const rows = parseRerankPayload({ results: [{ index: 0, score: 1 }] });
  assert.equal(rows[0]?.index, 0);
});

test("HttpReranker fails fast when the service is unreachable", async () => {
  const reranker = new HttpReranker("http://127.0.0.1:1");
  await assert.rejects(
    () => reranker.rerank({ query: "q", texts: ["a"], timeoutMs: 400 }),
    /fetch|ECONNREFUSED|AbortError|timeout|network/i,
  );
});
