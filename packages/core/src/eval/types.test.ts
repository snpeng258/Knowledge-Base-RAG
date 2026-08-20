import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyCase, expectedHit, summarize } from "./types.ts";
import type { CaseResult } from "./types.ts";

test("empty expected ids only hit when search returns nothing", () => {
  assert.equal(expectedHit([], []), true);
  assert.equal(expectedHit([], ["doc-a"]), false);
  assert.equal(expectedHit(["doc-a"], ["doc-b", "doc-a"]), true);
  assert.equal(expectedHit(["doc-a", "doc-b"], ["doc-a"]), false);
});

test("known-fail and unexpected-fail are distinct statuses", () => {
  assert.equal(classifyCase("pass", true), "pass");
  assert.equal(classifyCase("pass", false), "unexpected-fail");
  assert.equal(classifyCase("known-fail", false), "known-fail");
  assert.equal(classifyCase("known-fail", true), "unexpected-pass");
});

test("hit rate ignores known-fail cases", () => {
  const rows: CaseResult[] = [
    {
      id: "a",
      category: "keyword",
      query: "q",
      expect: "pass",
      status: "pass",
      expectedIds: ["1"],
      actualIds: ["1"],
      reason: null,
    },
    {
      id: "b",
      category: "synonym",
      query: "q",
      expect: "known-fail",
      status: "known-fail",
      expectedIds: ["1"],
      actualIds: [],
      reason: "synonym",
    },
    {
      id: "c",
      category: "keyword",
      query: "q",
      expect: "pass",
      status: "unexpected-fail",
      expectedIds: ["1"],
      actualIds: [],
      reason: null,
    },
  ];
  const report = summarize(rows);
  assert.equal(report.hitRate, 0.5);
  assert.equal(report.knownFail, 1);
  assert.equal(report.unexpectedFail, 1);
});
