import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  vector,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    lang: text("lang"),
    sourceKind: text("source_kind").notNull(),
    sourceRef: text("source_ref").notNull(),
    sourceUrl: text("source_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: text("status").notNull().default("draft"),
    wordCount: integer("word_count"),
    searchVector: tsvector("search_vector"),
    meta: jsonb("meta").notNull().default({}),
  },
  (table) => [
    unique("documents_source_idx").on(table.sourceKind, table.sourceRef),
    index("documents_search_idx").using("gin", table.searchVector),
    index("documents_kind_idx").on(table.kind),
    index("documents_occurred_idx").on(table.occurredAt),
  ],
);

export const chunks = pgTable(
  "chunks",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    ord: integer("ord").notNull(),
    text: text("text").notNull(),
    charStart: integer("char_start").notNull(),
    charEnd: integer("char_end").notNull(),
    speaker: text("speaker"),
    tsStart: integer("ts_start"),
    tsEnd: integer("ts_end"),
    tokenCount: integer("token_count"),
    searchVector: tsvector("search_vector"),
  },
  (table) => [
    unique("chunks_doc_ord_idx").on(table.documentId, table.ord),
    index("chunks_search_idx").using("gin", table.searchVector),
    index("chunks_doc_idx").on(table.documentId),
  ],
);

export const chunkEmbeddings = pgTable(
  "chunk_embeddings",
  {
    chunkId: bigint("chunk_id", { mode: "bigint" })
      .notNull()
      .references(() => chunks.id, { onDelete: "cascade" }),
    modelName: text("model_name").notNull(),
    dim: integer("dim").notNull(),
    embedding: vector("embedding", { dimensions: 1024 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.chunkId, table.modelName] })],
);

export const tags = pgTable("tags", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const documentTags = pgTable(
  "document_tags",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tagSlug: text("tag_slug")
      .notNull()
      .references(() => tags.slug),
    source: text("source").notNull(),
    confidence: real("confidence"),
  },
  (table) => [primaryKey({ columns: [table.documentId, table.tagSlug] })],
);

export const tagProposals = pgTable("tag_proposals", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  proposedName: text("proposed_name"),
  reason: text("reason"),
  documentId: text("document_id"),
  status: text("status"),
  createdAt: timestamp("created_at", { withTimezone: true }),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  sourceKind: text("source_kind"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  docCount: integer("doc_count"),
  status: text("status"),
  error: text("error"),
});

export const parseFailures = pgTable("parse_failures", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  sourceKind: text("source_kind"),
  sourceRef: text("source_ref"),
  reason: text("reason"),
  parserTried: text("parser_tried"),
  createdAt: timestamp("created_at", { withTimezone: true }),
  resolved: boolean("resolved").default(false),
});
