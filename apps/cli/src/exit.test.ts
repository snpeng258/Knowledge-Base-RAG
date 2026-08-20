import assert from "node:assert/strict";
import { test } from "node:test";
import { EXIT, batchIngestExit } from "./exit.ts";

test("mixed url ingest maps to exit 5", () => {
  assert.equal(batchIngestExit(1, 1), EXIT.partial);
  assert.equal(batchIngestExit(2, 0), EXIT.ok);
  assert.equal(batchIngestExit(0, 2), EXIT.error);
});
