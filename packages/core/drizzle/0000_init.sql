CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id text PRIMARY KEY,
  kind text NOT NULL,
  title text NOT NULL,
  description text,
  content text NOT NULL,
  content_hash text NOT NULL,
  lang text,
  source_kind text NOT NULL,
  source_ref text NOT NULL,
  source_url text,
  occurred_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'draft',
  word_count integer,
  search_vector tsvector,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT documents_source_idx UNIQUE (source_kind, source_ref)
);

CREATE INDEX documents_search_idx ON documents USING gin (search_vector);
CREATE INDEX documents_kind_idx ON documents (kind);
CREATE INDEX documents_occurred_idx ON documents (occurred_at DESC NULLS LAST);

CREATE TABLE chunks (
  id bigserial PRIMARY KEY,
  document_id text NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  ord integer NOT NULL,
  text text NOT NULL,
  char_start integer NOT NULL,
  char_end integer NOT NULL,
  speaker text,
  ts_start integer,
  ts_end integer,
  token_count integer,
  search_vector tsvector,
  CONSTRAINT chunks_doc_ord_idx UNIQUE (document_id, ord)
);

CREATE INDEX chunks_search_idx ON chunks USING gin (search_vector);
CREATE INDEX chunks_doc_idx ON chunks (document_id);

CREATE TABLE chunk_embeddings (
  chunk_id bigint NOT NULL REFERENCES chunks (id) ON DELETE CASCADE,
  model_name text NOT NULL,
  dim integer NOT NULL,
  embedding vector(1024) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_id, model_name)
);

CREATE TABLE tags (
  slug text PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_tags (
  document_id text NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  tag_slug text NOT NULL REFERENCES tags (slug),
  source text NOT NULL,
  confidence real,
  PRIMARY KEY (document_id, tag_slug)
);

CREATE TABLE tag_proposals (
  id bigserial PRIMARY KEY,
  proposed_name text,
  reason text,
  document_id text,
  status text,
  created_at timestamptz
);

CREATE TABLE ingest_runs (
  id bigserial PRIMARY KEY,
  source_kind text,
  started_at timestamptz,
  finished_at timestamptz,
  doc_count integer,
  status text,
  error text
);

CREATE TABLE parse_failures (
  id bigserial PRIMARY KEY,
  source_kind text,
  source_ref text,
  reason text,
  parser_tried text,
  created_at timestamptz,
  resolved boolean DEFAULT false
);
