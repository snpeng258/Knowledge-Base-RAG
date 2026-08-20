import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { ingestLocalFile } from "../ingest/file.ts";
import type { LlmProvider } from "./types.ts";
import { parseDescription, refineDescription } from "./refine.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

test("parseDescription rejects dirty model output", () => {
  assert.equal(parseDescription({ description: "这是一句合规摘要。" }), "这是一句合规摘要。");
  assert.equal(parseDescription({ description: "x" }), null);
  assert.equal(parseDescription({ description: 12 }), null);
  assert.equal(parseDescription("not json object"), null);
  assert.equal(parseDescription({ description: "a".repeat(200) }), null);
});

test("mock provider failures leave description empty and ingest succeeds", async () => {
  await runMigrations();
  const url = databaseUrl();
  const dir = await mkdtemp(join(tmpdir(), "kb-llm-"));
  const fixture = join(dir, "sample.md");
  await writeFile(fixture, "# 提炼测试文档\n\n知识检索要能回到原文，产品力相关内容用于入库。\n", "utf8");

  const throwingProvider: LlmProvider = {
    name: "mock-down",
    async completeJson() {
      throw new Error("connect ECONNREFUSED");
    },
  };
  const invalidProvider: LlmProvider = {
    name: "mock-invalid",
    async completeJson() {
      return { joke: "not a description" };
    },
  };
  const hangingProvider: LlmProvider = {
    name: "mock-hang",
    completeJson() {
      return new Promise(() => undefined);
    },
  };
  const goodProvider: LlmProvider = {
    name: "mock-good",
    async completeJson() {
      return { description: "用一句话说明知识检索要能回到原文。" };
    },
  };

  const timedOut = await refineDescription("hello", hangingProvider, 40);
  assert.equal(timedOut, null);

  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const down = await ingestLocalFile(fixture, url, { llm: throwingProvider });
    const [afterDown] = await sql<{ description: string | null }[]>`
      SELECT description FROM documents WHERE id = ${down.documentId}
    `;
    assert.equal(afterDown?.description, null);
    assert.ok(down.documentId.length > 0);

    await ingestLocalFile(fixture, url, { llm: invalidProvider });
    const [afterInvalid] = await sql<{ description: string | null }[]>`
      SELECT description FROM documents WHERE id = ${down.documentId}
    `;
    assert.equal(afterInvalid?.description, null);

    await ingestLocalFile(fixture, url, { llm: goodProvider });
    const [afterGood] = await sql<{ description: string | null }[]>`
      SELECT description FROM documents WHERE id = ${down.documentId}
    `;
    assert.ok(afterGood?.description !== null);
    assert.ok((afterGood?.description ?? "").length > 4);
    assert.ok((afterGood?.description ?? "").length <= 160);
    assert.doesNotMatch(afterGood?.description ?? "", /\n/);
  } finally {
    await sql.end({ timeout: 1 });
    await rm(dir, { recursive: true, force: true });
  }
});
