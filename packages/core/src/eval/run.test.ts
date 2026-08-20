import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runEval } from "./run.ts";
import type { EvalSuite } from "./types.ts";

const root = repoRootFrom(import.meta.url);
loadEnvFiles(root);

test("eval fixtures are de-identified", async () => {
  const files = [
    "fixtures/sample-meeting.md",
    "fixtures/eval/sample-article.md",
    "fixtures/eval/sample-ops.md",
  ];
  for (const rel of files) {
    const text = await readFile(resolve(root, rel), "utf8");
    assert.match(text, /脱敏 fixture/);
    assert.doesNotMatch(text, /ou_[a-z0-9]+/);
  }
});

test("eval suite covers four categories and at least eight cases", async () => {
  const suite = JSON.parse(
    await readFile(new URL("./cases.json", import.meta.url), "utf8"),
  ) as EvalSuite;
  assert.ok(suite.cases.length >= 8);
  const categories = new Set(suite.cases.map((row) => row.category));
  assert.deepEqual([...categories].sort(), ["keyword", "none", "synonym", "tag"]);
  assert.ok(suite.cases.some((row) => row.expect === "known-fail"));
});

test("fulltext eval baseline has no unexpected failures", async () => {
  const report = await runEval(databaseUrl(), root);
  const unexpected = report.results.filter((row) => row.status === "unexpected-fail").map((row) => row.id);
  assert.deepEqual(unexpected, [], `unexpected-fail: ${unexpected.join(",")}`);
  assert.equal(report.hitRate, 1);
  assert.ok(report.knownFail >= 1);
  assert.ok(report.total >= 8);
  assert.ok(report.results.some((row) => row.status === "pass"));
  assert.ok(report.results.some((row) => row.status === "known-fail"));
});
