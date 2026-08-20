# 数据模型规格

> Created: 2026-08-21
> Updated: 2026-08-21
> Status: approved
>
> 架构前提见 [ADR-001](../designs/adr-001-tech-stack-and-architecture.md)。本文是其第 5 节的展开。
>
> 本文定义**第一版** schema。字段可以增加，但 ADR-001 §5 的三条硬约束（偏移量、说话人与时间戳、可读 slug）不得省略——它们是不可逆的。

---

## 1. 背景

系统要把三类异构来源统一成可检索的对象：飞书妙记（带说话人与时间戳的会议转写）、链接解析文本、本地文件。检索侧要支持渐进式披露（先返回文档级卡片，再按 id 取全文），并且结果必须能回到原文位置。

---

## 2. 目标

1. 一套 schema 容纳全部来源，检索时不需要按来源分支
2. 支持渐进式披露：卡片查询不触碰全文字段
3. 支持「回到原文」：切片带字符偏移量，会议切片带时间戳
4. 入库幂等：同一来源反复处理不产生重复
5. 支持换 embedding 模型而不重建主表
6. 标签受控：LLM 只能从词表选择，新词进待确认队列

---

## 3. 方案

### 3.1 `documents` —— 文档主表

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `text` | PK | **人可读 slug**，如 `mtg-2026-08-12-kickoff`、`link-a3f9c1d2` |
| `kind` | `text` | NOT NULL | `meeting` \| `link` \| `file` \| `image` |
| `title` | `text` | NOT NULL | |
| `description` | `text` | NULL 允许 | LLM 生成的一句话摘要。**允许为空**：Loop 2 阶段尚无 LLM |
| `content` | `text` | NOT NULL | 全文。Postgres TOAST 自动外置，无需分表 |
| `content_hash` | `text` | NOT NULL | `content` 的 SHA-256，用于判断是否需要更新 |
| `lang` | `text` | NULL | `zh` \| `en` \| … |
| `source_kind` | `text` | NOT NULL | `lark_minutes` \| `lark_file` \| `url` \| `local_file` |
| `source_ref` | `text` | NOT NULL | 来源的稳定标识：`minute_token` / 绝对路径 / 规范化 URL |
| `source_url` | `text` | NULL | 可点击回原文的地址 |
| `occurred_at` | `timestamptz` | NULL | 会议发生时间 / 文章发布时间。**用于时间轴筛选** |
| `ingested_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |
| `status` | `text` | NOT NULL DEFAULT `'draft'` | `draft` \| `reviewed`。人工复核 LLM 产出的开关 |
| `word_count` | `integer` | NULL | |
| `search_vector` | `tsvector` | NULL | 应用层分词后写入，Postgres 端用 `simple` 配置 |
| `meta` | `jsonb` | NOT NULL DEFAULT `'{}'` | 来源特有字段的逃生舱，避免频繁改表 |

**幂等键**：`UNIQUE (source_kind, source_ref)`。入库一律 upsert：命中已有行且 `content_hash` 相同则跳过（仅更新 `updated_at`）；不同则更新内容并重建下游切片。

> 不要用 `content_hash` 做唯一键——同一内容可能合法地来自两个不同来源，需要各自保留 source 信息。

**索引**

```sql
CREATE UNIQUE INDEX documents_source_idx ON documents (source_kind, source_ref);
CREATE INDEX documents_search_idx  ON documents USING gin (search_vector);
CREATE INDEX documents_kind_idx    ON documents (kind);
CREATE INDEX documents_occurred_idx ON documents (occurred_at DESC NULLS LAST);
```

**卡片查询纪律**：渐进式披露的第 2 步只需要 `id, kind, title, description, tags, occurred_at, source_url`。**禁止 `SELECT *`**，否则每次搜索都会把全文拖出来。

### 3.2 `chunks` —— 切片

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `id` | `bigserial` | PK | |
| `document_id` | `text` | NOT NULL, FK → `documents.id` ON DELETE CASCADE | |
| `ord` | `integer` | NOT NULL | 在文档内的顺序，从 0 开始 |
| `text` | `text` | NOT NULL | |
| `char_start` | `integer` | NOT NULL | **硬约束**：在 `documents.content` 中的起始字符偏移 |
| `char_end` | `integer` | NOT NULL | **硬约束**：结束偏移（不含） |
| `speaker` | `text` | NULL | **硬约束（会议类必填）**：说话人 |
| `ts_start` | `integer` | NULL | **硬约束（会议类必填）**：相对秒数 |
| `ts_end` | `integer` | NULL | |
| `token_count` | `integer` | NULL | |
| `search_vector` | `tsvector` | NULL | |

**约束**：`UNIQUE (document_id, ord)`

**不变式**：`documents.content.slice(char_start, char_end) === chunks.text`。这条必须有测试守护——它是「回到原文」的全部依据，一旦切分逻辑改动导致偏移错位，检索结果会指向错误位置且难以察觉。

**索引**

```sql
CREATE UNIQUE INDEX chunks_doc_ord_idx ON chunks (document_id, ord);
CREATE INDEX chunks_search_idx ON chunks USING gin (search_vector);
CREATE INDEX chunks_doc_idx    ON chunks (document_id);
```

### 3.3 `chunk_embeddings` —— 向量（独立表）

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `chunk_id` | `bigint` | NOT NULL, FK → `chunks.id` ON DELETE CASCADE | |
| `model_name` | `text` | NOT NULL | 如 `BAAI/bge-m3` |
| `dim` | `integer` | NOT NULL | 冗余记录，便于校验 |
| `embedding` | `vector(1024)` | NOT NULL | bge-m3 dense 维度 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

**主键**：`(chunk_id, model_name)`——同一切片可同时保留多个模型的向量，便于 A/B 对比。

**已知限制**：pgvector 的 `vector(n)` 维度固定。若换用维度不同的模型，需要新增一列或新建表，而**不影响 `documents` 与 `chunks`**——这正是把向量独立成表的原因。

**索引**（Loop 6 建立，数据灌完后再建以加快灌入）

```sql
CREATE INDEX chunk_embeddings_hnsw_idx ON chunk_embeddings
  USING hnsw (embedding vector_cosine_ops);
```

### 3.4 `tags` —— 受控词表

| 列 | 类型 | 约束 | 说明 |
|---|---|---|---|
| `slug` | `text` | PK | 如 `rag`、`product-strategy` |
| `name` | `text` | NOT NULL | 显示名，如 `RAG 检索` |
| `description` | `text` | NULL | **给 LLM 读的判据**：什么内容该打这个标签 |
| `created_at` | `timestamptz` | NOT NULL DEFAULT `now()` | |

`description` 不是装饰。LLM 打标时会读它来判断是否适用——这是让 7-8B 小模型也能稳定打标的关键（ADR-001 D6）。

### 3.5 `document_tags`

| 列 | 类型 | 约束 |
|---|---|---|
| `document_id` | `text` | NOT NULL, FK → `documents.id` ON DELETE CASCADE |
| `tag_slug` | `text` | NOT NULL, FK → `tags.slug` |
| `source` | `text` | NOT NULL, `llm` \| `human` |
| `confidence` | `real` | NULL |

**主键**：`(document_id, tag_slug)`

`source` 用于区分人工标注与模型标注。人工标注**不得被后续自动入库覆盖**。

### 3.6 `tag_proposals` —— 待确认新标签

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | `bigserial` | PK |
| `proposed_name` | `text` | LLM 提议的标签名 |
| `reason` | `text` | 为什么现有词表不够 |
| `document_id` | `text` | 触发提议的文档 |
| `status` | `text` | `pending` \| `approved` \| `rejected` |
| `created_at` | `timestamptz` | |

这是「受控但不僵化」的机制：LLM 不能直接创造标签，但能提议；人工批量确认后才进 `tags`。

### 3.7 `ingest_runs` —— 入库溯源

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | `bigserial` | PK |
| `source_kind` | `text` | |
| `started_at` / `finished_at` | `timestamptz` | |
| `doc_count` | `integer` | 本次处理的文档数 |
| `status` | `text` | `running` \| `success` \| `partial` \| `failed` |
| `error` | `text` | |

用途是回答「这批数据什么时候、用什么流程进来的」。无人值守跑批之后，这张表是唯一能还原当晚发生了什么的地方。

### 3.8 `parse_failures` —— 解析失败队列

| 列 | 类型 | 说明 |
|---|---|---|
| `id` | `bigserial` | PK |
| `source_kind` / `source_ref` | `text` | |
| `reason` | `text` | 失败原因 |
| `parser_tried` | `text` | 尝试过哪些解析器 |
| `created_at` | `timestamptz` | |
| `resolved` | `boolean` | DEFAULT `false` |

链接解析必然有失败（反爬、需登录、SPA）。**失败不得静默丢弃**——必须落到这张表，否则你永远不知道有多少语料没进来。这也是 `code-style.md`「错误要可见」的落地。

---

## 4. 迁移工具

推荐 **Drizzle ORM + drizzle-kit**：对 pgvector 有原生 `vector` 类型支持、迁移生成成熟、且允许在混合检索这类复杂查询处直接写 raw SQL。

> 这属于实现层选型而非架构决策。若 Loop 1 实测有阻碍（例如 pgvector 或 `tsvector` 支持不顺），允许换成 `kysely` + 手写 SQL 迁移，按 [plan-loop-engineering.md](../plans/plan-loop-engineering.md) 第 6 节归类为「实现类」自行处置，无需请示。**不允许**换成需要改变 schema 设计的方案。

---

## 5. 验收命令

Loop 1 的 DoD：

```powershell
docker compose up -d                    # Postgres + pgvector 起来
pnpm db:migrate                         # 迁移成功，退出码 0
pnpm test                               # schema 相关测试全绿
```

schema 层必须有测试覆盖的两条不变式：

1. 同一来源重复入库两次，`documents` 行数不变（幂等）
2. 对任意切片，`content.slice(char_start, char_end) === text`（偏移量正确）

---

## 6. 风险

| 风险 | 说明与缓解 |
|---|---|
| 切分逻辑改动导致偏移错位 | 用第 5 节的不变式测试守护；这是最容易悄悄坏掉的地方 |
| `vector(1024)` 锁定维度 | 向量已独立成表，换模型不影响主表；必要时加列或新表 |
| 应用层分词与库内 `simple` 配置不一致 | 分词逻辑必须收敛在 `packages/core` 的单一函数，写入与查询共用 |
| 标签词表初期为空 | Loop 5 之前 `description` 与 tags 允许为空，检索降级到全文；不阻塞链路 |
| `meta` JSONB 沦为垃圾场 | 只放来源特有且不参与检索的字段；一旦某字段需要被查询就提升为正式列 |
