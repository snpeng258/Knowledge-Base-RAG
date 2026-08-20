import { createHash } from "node:crypto";
import postgres from "postgres";
import { NotFoundError } from "../errors.ts";
import type { LlmProvider } from "./types.ts";

const TIMEOUT_MS = 15_000;

export type VocabTag = {
  slug: string;
  name: string;
  description: string | null;
};

export type TagProposal = {
  id: string;
  proposedName: string | null;
  reason: string | null;
  documentId: string | null;
  status: string | null;
  createdAt: string | null;
};

export type TagDecision = {
  slugs: string[];
  proposals: { name: string; reason: string }[];
};

export function parseTagDecision(value: unknown, allowed: Set<string>): TagDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { slugs: [], proposals: [] };
  }
  const record = value as Record<string, unknown>;
  const slugs = Array.isArray(record.tags)
    ? record.tags.filter((item): item is string => typeof item === "string" && allowed.has(item))
    : [];
  const unique = [...new Set(slugs)];
  const proposals = Array.isArray(record.proposals)
    ? record.proposals.flatMap((item) => {
        if (typeof item !== "object" || item === null) {
          return [];
        }
        const row = item as Record<string, unknown>;
        if (typeof row.name !== "string" || typeof row.reason !== "string") {
          return [];
        }
        const name = row.name.replace(/\s+/g, " ").trim();
        const reason = row.reason.replace(/\s+/g, " ").trim();
        if (name.length === 0 || reason.length === 0) {
          return [];
        }
        return [{ name, reason }];
      })
    : [];
  return { slugs: unique, proposals };
}

export function slugFromProposedName(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length > 0) {
    return ascii.slice(0, 48);
  }
  return `tag-${createHash("sha256").update(name).digest("hex").slice(0, 8)}`;
}

export async function loadVocabulary(databaseUrl: string): Promise<VocabTag[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    return await sql<VocabTag[]>`SELECT slug, name, description FROM tags ORDER BY slug`;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function attachTags(
  databaseUrl: string,
  documentId: string,
  content: string,
  provider: LlmProvider | null,
  options?: { vocabulary?: VocabTag[] },
): Promise<TagDecision | null> {
  if (provider === null) {
    return null;
  }
  try {
    const vocab = options?.vocabulary ?? (await loadVocabulary(databaseUrl));
    if (vocab.length === 0) {
      return { slugs: [], proposals: [] };
    }
    const allowed = new Set(vocab.map((tag) => tag.slug));
    const excerpt = content.slice(0, 4000);
    const catalog = vocab
      .map((tag) => `- ${tag.slug} (${tag.name}): ${tag.description ?? ""}`)
      .join("\n");
    const prompt = `从下列受控标签中选择 0 到 3 个 slug。只输出 JSON：{"tags":["slug"],"proposals":[{"name":"...","reason":"..."}]}。tags 只能使用词表中的 slug，禁止编造。现有词表不够时把新词放进 proposals。\n\n词表：\n${catalog}\n\n文档：\n${excerpt}`;
    const parsed = await completeJsonWithTimeout(provider, prompt, TIMEOUT_MS);
    const decision = parseTagDecision(parsed, allowed);
    await applyTagDecision(databaseUrl, documentId, allowed, decision);
    return decision;
  } catch {
    return null;
  }
}

export async function setDocumentTag(
  databaseUrl: string,
  documentId: string,
  slug: string,
  source: "human" | "llm",
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    await sql`
      INSERT INTO document_tags (document_id, tag_slug, source)
      VALUES (${documentId}, ${slug}, ${source})
      ON CONFLICT (document_id, tag_slug) DO UPDATE SET source = EXCLUDED.source
      WHERE document_tags.source <> 'human' OR EXCLUDED.source = 'human'
    `;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function listTagProposals(databaseUrl: string): Promise<TagProposal[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    const rows = await sql<{
      id: string;
      proposed_name: string | null;
      reason: string | null;
      document_id: string | null;
      status: string | null;
      created_at: Date | null;
    }[]>`
      SELECT id::text, proposed_name, reason, document_id, status, created_at
      FROM tag_proposals
      ORDER BY id
    `;
    return rows.map((row) => ({
      id: row.id,
      proposedName: row.proposed_name,
      reason: row.reason,
      documentId: row.document_id,
      status: row.status,
      createdAt: row.created_at === null ? null : row.created_at.toISOString(),
    }));
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function approveTagProposal(databaseUrl: string, proposalId: string): Promise<VocabTag> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    const [row] = await sql<{
      id: string;
      proposed_name: string | null;
      reason: string | null;
      status: string | null;
    }[]>`
      SELECT id::text, proposed_name, reason, status FROM tag_proposals WHERE id::text = ${proposalId}
    `;
    if (row === undefined) {
      throw new NotFoundError(`tag proposal not found: ${proposalId}`);
    }
    if (row.status !== "pending") {
      throw new Error(`tag proposal ${proposalId} is ${row.status ?? "unknown"}, not pending`);
    }
    const name = (row.proposed_name ?? "").trim();
    if (name.length === 0) {
      throw new Error(`tag proposal ${proposalId} has no name`);
    }
    const slug = slugFromProposedName(name);
    await sql`
      INSERT INTO tags (slug, name, description)
      VALUES (${slug}, ${name}, ${row.reason})
      ON CONFLICT (slug) DO NOTHING
    `;
    await sql`UPDATE tag_proposals SET status = 'approved' WHERE id::text = ${proposalId}`;
    return { slug, name, description: row.reason };
  } finally {
    await sql.end({ timeout: 1 });
  }
}

export async function rejectTagProposal(databaseUrl: string, proposalId: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    const [row] = await sql<{ id: string }[]>`
      SELECT id::text FROM tag_proposals WHERE id::text = ${proposalId}
    `;
    if (row === undefined) {
      throw new NotFoundError(`tag proposal not found: ${proposalId}`);
    }
    await sql`UPDATE tag_proposals SET status = 'rejected' WHERE id::text = ${proposalId}`;
  } finally {
    await sql.end({ timeout: 1 });
  }
}

async function completeJsonWithTimeout(provider: LlmProvider, prompt: string, timeoutMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.completeJson(prompt, timeoutMs),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("llm tag timeout")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

async function applyTagDecision(
  databaseUrl: string,
  documentId: string,
  allowed: Set<string>,
  decision: TagDecision,
): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  try {
    const existing = await sql<{ tag_slug: string; source: string }[]>`
      SELECT tag_slug, source FROM document_tags WHERE document_id = ${documentId}
    `;
    const human = new Set(existing.filter((row) => row.source === "human").map((row) => row.tag_slug));
    const selected = decision.slugs.filter((slug) => allowed.has(slug));

    for (const slug of selected) {
      if (human.has(slug)) {
        continue;
      }
      await sql`
        INSERT INTO document_tags (document_id, tag_slug, source)
        VALUES (${documentId}, ${slug}, 'llm')
        ON CONFLICT (document_id, tag_slug) DO NOTHING
      `;
    }

    const keep = new Set([...human, ...selected]);
    const stale = existing.filter((row) => row.source !== "human" && !keep.has(row.tag_slug));
    for (const row of stale) {
      await sql`
        DELETE FROM document_tags
        WHERE document_id = ${documentId} AND tag_slug = ${row.tag_slug} AND source <> 'human'
      `;
    }

    for (const proposal of decision.proposals) {
      const prior = await sql<{ status: string | null }[]>`
        SELECT status FROM tag_proposals
        WHERE lower(btrim(proposed_name)) = lower(btrim(${proposal.name}))
      `;
      if (prior.some((row) => row.status === "pending" || row.status === "rejected")) {
        continue;
      }
      await sql`
        INSERT INTO tag_proposals (proposed_name, reason, document_id, status, created_at)
        VALUES (${proposal.name}, ${proposal.reason}, ${documentId}, 'pending', now())
      `;
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
}
