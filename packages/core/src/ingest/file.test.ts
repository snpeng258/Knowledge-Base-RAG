import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { splitIntoChunks } from "./chunk.ts";
import { ingestLocalFile } from "./file.ts";
import { canonicalLocalPath, isUuidLike, slugFromFilePath } from "./slug.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

test("sample meeting fixture is de-identified and searchable", async () => {
  const fixture = resolve(repoRootFrom(import.meta.url), "fixtures/sample-meeting.md");
  const text = await readFile(fixture, "utf8");
  assert.match(text, /产品力/);
  assert.match(text, /技术力/);
  assert.doesNotMatch(text, /ou_[a-z0-9]+/);
});

test("chunk offsets match the stored string across multiple blocks", () => {
  const content = Array.from({ length: 24 }, (_, index) => `段落${index} 产品力技术力检索`).join("\n\n");
  const pieces = splitIntoChunks(content, 80);
  assert.ok(pieces.length >= 2);
  for (const [index, piece] of pieces.entries()) {
    assert.equal(piece.ord, index);
    assert.equal(content.slice(piece.charStart, piece.charEnd), piece.text);
  }
});

test("ingest local markdown is idempotent and keeps offsets", async () => {
  await runMigrations();
  const url = databaseUrl();
  const dir = await mkdtemp(join(tmpdir(), "kb-ingest-"));
  const filePath = join(dir, "sample-meeting.md");
  const paragraphs = Array.from(
    { length: 30 },
    (_, index) =>
      `第${index + 1}段：我们讨论过产品力和技术力两条路径。检索结果必须能回到原文位置，切片要保存字符偏移量。渐进式披露先看描述再按 id 取全文。`,
  );
  const originalLf = ["# 假期项目启动会", "", ...paragraphs].join("\n");
  await writeFile(filePath, originalLf.replace(/\n/g, "\r\n"), "utf8");

  const first = await ingestLocalFile(filePath, url);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    const second = await ingestLocalFile(filePath, url);
    assert.equal(first.documentId, second.documentId);
    assert.equal(second.action, "skipped");
    assert.ok(second.chunkCount >= 2);
    assert.ok(!isUuidLike(first.documentId));
    assert.match(first.documentId, /^file-sample-meeting-[a-f0-9]{8}$/);
    assert.equal(slugFromFilePath(filePath), first.documentId);
    const sourceRef = canonicalLocalPath(filePath);
    const docCount = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM documents WHERE source_kind = 'local_file' AND source_ref = ${sourceRef}
    `;
    assert.equal(docCount[0]?.count, "1");

    const doc = await sql<{ id: string; content: string; content_hash: string }[]>`
      SELECT id, content, content_hash FROM documents WHERE id = ${first.documentId}
    `;
    const stored = doc[0];
    assert.ok(stored);
    assert.doesNotMatch(stored.content, /\r\n/);

    const chunkRows = await sql<{ ord: number; text: string; char_start: number; char_end: number }[]>`
      SELECT ord, text, char_start, char_end FROM chunks WHERE document_id = ${first.documentId} ORDER BY ord
    `;
    assert.ok(chunkRows.length >= 2);
    for (const [index, chunk] of chunkRows.entries()) {
      assert.equal(chunk.ord, index);
      assert.equal(stored.content.slice(chunk.char_start, chunk.char_end), chunk.text);
    }

    const runs = await sql<{ status: string }[]>`
      SELECT status FROM ingest_runs WHERE id IN (${first.ingestRunId}, ${second.ingestRunId})
    `;
    assert.equal(runs.length, 2);
    assert.ok(runs.every((run) => run.status === "success"));

    const changed = `${stored.content}\n\n补充一句：入库后要能回到原文。\n`;
    await writeFile(filePath, changed, "utf8");
    const third = await ingestLocalFile(filePath, url);
    assert.equal(third.action, "updated");
    const updated = await sql<{ content_hash: string }[]>`
      SELECT content_hash FROM documents WHERE id = ${first.documentId}
    `;
    assert.notEqual(updated[0]?.content_hash, stored.content_hash);

    const leftover = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM chunks
      WHERE document_id = ${first.documentId}
        AND ord >= ${third.chunkCount}
    `;
    assert.equal(leftover[0]?.count, "0");

    const refreshed = await sql<{ content: string }[]>`
      SELECT content FROM documents WHERE id = ${first.documentId}
    `;
    const newChunks = await sql<{ text: string; char_start: number; char_end: number }[]>`
      SELECT text, char_start, char_end FROM chunks WHERE document_id = ${first.documentId}
    `;
    assert.ok(newChunks.length >= 2);
    for (const chunk of newChunks) {
      assert.equal(refreshed[0]?.content.slice(chunk.char_start, chunk.char_end), chunk.text);
    }

    await assert.rejects(
      () => ingestLocalFile(join(dir, "missing.md"), url),
      (error: unknown) => error instanceof Error && error.message.includes("missing.md"),
    );
  } finally {
    await sql`DELETE FROM documents WHERE id = ${first.documentId}`;
    await sql.end();
  }
});
