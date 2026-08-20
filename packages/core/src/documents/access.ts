import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { documents, documentTags, tags } from "../db/schema.ts";
import { DependencyError, NotFoundError, toDependencyError } from "../errors.ts";

export { DependencyError, NotFoundError };

export type DocumentRecord = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  tags: string[];
  occurredAt: string | null;
  source: { kind: string; ref: string; url: string | null };
  content: string;
};

export async function getDocument(id: string, databaseUrl: string): Promise<DocumentRecord> {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  const db = drizzle(client);
  try {
    const [row] = await db.select().from(documents).where(eq(documents.id, id));
    if (row === undefined) {
      throw new NotFoundError(`document not found: ${id}`);
    }
    const tagRows = await db
      .select({ slug: documentTags.tagSlug })
      .from(documentTags)
      .where(eq(documentTags.documentId, id));
    return {
      id: row.id,
      kind: row.kind,
      title: row.title,
      description: row.description,
      tags: tagRows.map((tag) => tag.slug),
      occurredAt: row.occurredAt === null ? null : row.occurredAt.toISOString(),
      source: { kind: row.sourceKind, ref: row.sourceRef, url: row.sourceUrl },
      content: row.content,
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof DependencyError) {
      throw error;
    }
    toDependencyError(error, `get document ${id}`);
  } finally {
    await client.end({ timeout: 1 });
  }
}

export async function listTags(databaseUrl: string): Promise<{ slug: string; name: string; description: string | null }[]> {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
  const db = drizzle(client);
  try {
    return await db
      .select({ slug: tags.slug, name: tags.name, description: tags.description })
      .from(tags);
  } catch (error) {
    toDependencyError(error, "list tags");
  } finally {
    await client.end({ timeout: 1 });
  }
}
