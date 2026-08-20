import assert from "node:assert/strict";
import { test } from "node:test";
import { rerankOptionsFromEnv } from "./config.ts";

test("rerank is off unless the env flag is an explicit true", () => {
  assert.equal(rerankOptionsFromEnv({}).enabled, false);
  assert.equal(rerankOptionsFromEnv({ KB_RERANK_ENABLED: "0" }).enabled, false);
  assert.equal(rerankOptionsFromEnv({ KB_RERANK_ENABLED: "1" }).enabled, true);
  assert.equal(rerankOptionsFromEnv({ KB_RERANK_ENABLED: "true" }).enabled, true);
  assert.equal(rerankOptionsFromEnv({ KB_RERANK_TIMEOUT_MS: "1500" }).timeoutMs, 1500);
  assert.equal(rerankOptionsFromEnv({ KB_RERANK_CANDIDATES: "8" }).candidateLimit, 8);
  assert.equal(rerankOptionsFromEnv({ KB_RERANK_TIMEOUT_MS: "nope" }).timeoutMs, 3000);
});
