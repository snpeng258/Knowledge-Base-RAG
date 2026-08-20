import assert from "node:assert/strict";
import { test } from "node:test";
import { PACKAGE_NAME } from "./index.ts";

test("core package identity is stable", () => {
  assert.equal(PACKAGE_NAME, "@summer-sum/core");
});
