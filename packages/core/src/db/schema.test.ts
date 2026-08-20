import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { databaseUrl, loadEnvFiles, repoRootFrom } from "./env.ts";
import { runMigrations } from "./migrate.ts";

loadEnvFiles(repoRootFrom(import.meta.url));

test("schema constraints: unique source and cascade delete", async () => {
  await runMigrations();
  const sql = postgres(databaseUrl(), { max: 1 });
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const docId = `test-schema-${suffix}`;
  const sourceRef = `local://schema-test-${suffix}`;
  try {
    await sql`
      INSERT INTO documents (id, kind, title, content, content_hash, source_kind, source_ref)
      VALUES (${docId}, 'file', 'schema test', 'hello world', 'hash', 'local_file', ${sourceRef})
    `;

    await assert.rejects(
      async () => {
        await sql`
          INSERT INTO documents (id, kind, title, content, content_hash, source_kind, source_ref)
          VALUES (${`${docId}-dup`}, 'file', 'dup', 'x', 'hash2', 'local_file', ${sourceRef})
        `;
      },
      (error: unknown) => {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        return code === "23505";
      },
    );

    await sql`
      INSERT INTO chunks (document_id, ord, text, char_start, char_end)
      VALUES (${docId}, 0, 'hello world', 0, 11)
    `;
    const before = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM chunks WHERE document_id = ${docId}
    `;
    assert.equal(before[0]?.count, "1");

    await sql`DELETE FROM documents WHERE id = ${docId}`;
    const after = await sql<{ count: string }[]>`
      SELECT count(*)::text AS count FROM chunks WHERE document_id = ${docId}
    `;
    assert.equal(after[0]?.count, "0");
  } finally {
    await sql`DELETE FROM documents WHERE id = ${docId}`;
    await sql.end();
  }
});
