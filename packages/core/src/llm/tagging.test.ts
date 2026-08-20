import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "../db/env.ts";
import { runMigrations } from "../db/migrate.ts";
import { ingestLocalFile } from "../ingest/file.ts";
import { FulltextRetriever } from "../retrieve/fulltext.ts";
import type { LlmProvider } from "./types.ts";
import {
  approveTagProposal,
  attachTags,
  parseTagDecision,
  rejectTagProposal,
  setDocumentTag,
} from "./tagging.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

test("parseTagDecision drops slugs that are not in the vocabulary", () => {
  const allowed = new Set(["product-strategy"]);
  const parsed = parseTagDecision(
    { tags: ["product-strategy", "made-up"], proposals: [{ name: "baking", reason: "not in vocab" }] },
    allowed,
  );
  assert.deepEqual(parsed.slugs, ["product-strategy"]);
  assert.equal(parsed.proposals.length, 1);
});

test("controlled tagging writes vocab tags, proposals, and preserves human labels", async () => {
  await runMigrations();
  const url = databaseUrl();
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  await sql`
    DELETE FROM documents
    WHERE title IN ('产品策略讨论', '家用面包发酵', '阳台种菜')
  `;
  const dir = await mkdtemp(join(tmpdir(), "kb-tag-"));
  const unique = `${Date.now()}`;
  const fixture = join(dir, "sample.md");
  await writeFile(fixture, "# 产品策略讨论\n\n本周讨论产品力指标与路线图优先级。\n", "utf8");
  const oddFixture = join(dir, "baking.md");
  await writeFile(oddFixture, "# 家用面包发酵\n\n酵母、烤箱温度与过夜冷藏醒发。\n", "utf8");
  const approveFixture = join(dir, "garden.md");
  await writeFile(approveFixture, "# 阳台种菜\n\n番茄育苗与浇水节奏。\n", "utf8");
  const createdIds: string[] = [];
  let approvedSlug: string | undefined;

  const tagProvider: LlmProvider = {
    name: "mock-tags",
    async completeJson(prompt: string) {
      if (prompt.includes("阳台种菜") || prompt.includes("番茄育苗")) {
        return { tags: [], proposals: [{ name: `gardening-${unique}`, reason: "词表没有园艺主题" }] };
      }
      if (prompt.includes("家用面包") || prompt.includes("酵母")) {
        return { tags: ["not-a-real-slug"], proposals: [{ name: `baking-${unique}`, reason: "词表没有烘焙主题" }] };
      }
      if (prompt.includes("受控标签")) {
        return { tags: ["product-strategy", "invented-tag"] };
      }
      return { description: "讨论产品力指标与路线图优先级。" };
    },
  };

  let emptyCalled = false;
  const emptySpy: LlmProvider = {
    name: "mock-empty-vocab",
    async completeJson() {
      emptyCalled = true;
      return { tags: ["product-strategy"] };
    },
  };

  try {
    const ingested = await ingestLocalFile(fixture, url, { llm: tagProvider });
    createdIds.push(ingested.documentId);
    const assigned = await sql<{ tag_slug: string }[]>`
      SELECT tag_slug FROM document_tags WHERE document_id = ${ingested.documentId}
    `;
    const assignedSlugs = assigned.map((row) => row.tag_slug);
    assert.deepEqual(assignedSlugs, ["product-strategy"]);
    const unknown = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM document_tags dt
      LEFT JOIN tags t ON t.slug = dt.tag_slug
      WHERE dt.document_id = ${ingested.documentId} AND t.slug IS NULL
    `;
    assert.equal(unknown[0]?.count, "0");

    await setDocumentTag(url, ingested.documentId, "storage", "human");
    const dropLlm: LlmProvider = {
      name: "mock-drop",
      async completeJson(prompt: string) {
        if (prompt.includes("受控标签")) {
          return { tags: ["infrastructure"] };
        }
        return { description: "讨论产品力指标与路线图优先级。" };
      },
    };
    await ingestLocalFile(fixture, url, { llm: dropLlm });
    const afterHuman = await sql<{ tag_slug: string; source: string }[]>`
      SELECT tag_slug, source FROM document_tags WHERE document_id = ${ingested.documentId} ORDER BY tag_slug
    `;
    assert.deepEqual(
      afterHuman.map((row) => `${row.tag_slug}:${row.source}`),
      ["infrastructure:llm", "storage:human"],
    );

    const retriever = new FulltextRetriever(url);
    const tagged = await retriever.search({ query: "产品力", tags: ["storage"] });
    assert.ok(tagged.results.some((item) => item.id === ingested.documentId));

    await attachTags(url, ingested.documentId, "skip", emptySpy, { vocabulary: [] });
    assert.equal(emptyCalled, false);

    const odd = await ingestLocalFile(oddFixture, url, { llm: tagProvider });
    createdIds.push(odd.documentId);
    const proposals = await sql<{ id: string; proposed_name: string; status: string }[]>`
      SELECT id::text, proposed_name, status
      FROM tag_proposals
      WHERE document_id = ${odd.documentId}
    `;
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0]?.status, "pending");
    const proposalId = proposals[0]?.id;
    assert.ok(proposalId !== undefined);
    await rejectTagProposal(url, proposalId);
    await ingestLocalFile(oddFixture, url, { llm: tagProvider });
    const afterReject = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count
      FROM tag_proposals
      WHERE document_id = ${odd.documentId}
    `;
    assert.equal(afterReject[0]?.count, "1");

    const garden = await ingestLocalFile(approveFixture, url, { llm: tagProvider });
    createdIds.push(garden.documentId);
    const [pending] = await sql<{ id: string; proposed_name: string }[]>`
      SELECT id::text, proposed_name FROM tag_proposals WHERE document_id = ${garden.documentId}
    `;
    assert.ok(pending?.id);
    const approved = await approveTagProposal(url, pending.id);
    approvedSlug = approved.slug;
    const [vocab] = await sql<{ slug: string }[]>`SELECT slug FROM tags WHERE slug = ${approved.slug}`;
    assert.equal(vocab?.slug, approved.slug);
  } finally {
    if (createdIds.length > 0) {
      await sql`DELETE FROM tag_proposals WHERE document_id IN ${sql(createdIds)}`;
      await sql`DELETE FROM documents WHERE id IN ${sql(createdIds)}`;
    }
    if (approvedSlug !== undefined) {
      await sql`DELETE FROM tags WHERE slug = ${approvedSlug}`;
    }
    await sql.end({ timeout: 1 });
    await rm(dir, { recursive: true, force: true });
  }
});
