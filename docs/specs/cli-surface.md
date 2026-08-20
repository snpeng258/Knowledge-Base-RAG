# CLI 命令面规格

> Created: 2026-08-21
> Updated: 2026-08-21
> Status: approved
>
> 架构前提见 [ADR-001](../designs/adr-001-tech-stack-and-architecture.md)（尤其 D8 读写路径分离、D9 三门面平权）。
> 数据结构见 [data-model.md](./data-model.md)。

---

## 1. 背景

CLI 有两类消费者，需求不同：

| 消费者 | 需要什么 |
|---|---|
| **AI Agent**（Cursor / Claude Code） | 稳定的结构化输出、精确的退出码、可预测的字段 |
| **人**（含非技术同事） | 可读的表格、清晰的报错、少量必记命令 |

两者用同一套命令，靠 `--json` 开关切换输出形态。**不为 AI 单独做一套命令**——那会导致两条路径行为漂移。

---

## 2. 目标

1. 实现渐进式披露的三步交互（ADR-001 D9）
2. 读路径在 Ollama 与 TEI 全部离线时仍可用
3. 退出码可被脚本机械判断（无人值守 loop 依赖此项）
4. 支持本地直连与远程 API 双模式

---

## 3. 方案

### 3.1 命令总览

命令名 `kb`。包 `@summer-sum/cli`。

| 命令 | 用途 | 路径 | LLM 依赖 |
|---|---|---|---|
| `kb doctor` | 健康检查 | — | 否 |
| `kb tags` | 列出受控词表（含判据 description） | 读 | 否 |
| `kb tags proposals` | 列出待确认标签提议 | 读 | 否 |
| `kb tags approve <id>` / `kb tags reject <id>` | 审批新标签提议 | 写 | 否 |
| `kb search <query>` | 返回文档级卡片 | 读 | 否 |
| `kb get <id>` | 取文档全文 | 读 | 否 |
| `kb ls` | 按条件列文档 | 读 | 否 |
| `kb ingest file <path>` | 入库本地文件 | 写 | 可选 |
| `kb ingest url <url>` | 解析并入库链接 | 写 | 可选 |
| `kb ingest lark <subcmd>` | 从飞书官方 API 入库 | 写 | 可选 |
| `kb embed` | 为尚无向量的切片灌入 embedding | 写 | 否（依赖 TEI，不依赖 LLM） |
| `kb mcp` | 启动 MCP server（stdio） | 读 | 否 |

### 3.2 渐进式披露的三步

这是本项目检索的核心交互，AI Agent 按此顺序调用：

```powershell
# 第 1 步：了解知识库有哪些维度
kb tags --json

# 第 2 步：搜索，只拿卡片（不含全文）
kb search "产品力 技术力" --json

# 第 3 步：判断相关后，按 id 精确取全文
kb get mtg-2026-08-12-kickoff --json
```

**`kb search` 绝不返回全文。** 它返回 `id / kind / title / description / tags / occurred_at / source_url` 以及命中片段。这是渐进式披露成立的前提——若 search 直接返回全文，AI 的上下文会被无关内容填满，整个设计失去意义。

### 3.3 `kb search` 输出契约

```jsonc
{
  "query": "产品力 技术力",
  "stage": "fulltext",          // fulltext | vector | hybrid | rerank  —— 实际用了哪层检索
  "degraded": false,             // true 表示因依赖不可用而降级
  "total": 3,
  "results": [
    {
      "id": "mtg-2026-08-12-kickoff",
      "kind": "meeting",
      "title": "假期项目启动会",
      "description": "讨论知识检索工具的方向...",   // 可能为 null（Loop 5 之前）
      "tags": ["product-strategy", "rag"],
      "occurred_at": "2026-08-12T10:00:00+08:00",
      "source_url": null,
      "score": 0.82,
      "hits": [
        {
          "chunk_ord": 14,
          "snippet": "...我们讨论过产品力和技术力两条路径...",
          "char_start": 3021,      // 回到原文的定位信息
          "char_end": 3180,
          "speaker": "说话人1",     // 会议类才有
          "ts_start": 742
        }
      ]
    }
  ]
}
```

`stage` 与 `degraded` 两个字段是给自动化用的：loop 里的端测 sub-agent 靠它判断「检索是走了向量还是降级到了全文」，而不必去猜。

**筛选参数**：`--tag <slug>`（可重复）、`--kind <kind>`、`--since <date>`、`--until <date>`、`--limit <n>`（默认 10）。

### 3.4 `kb get` 输出契约

```jsonc
{
  "id": "mtg-2026-08-12-kickoff",
  "kind": "meeting",
  "title": "假期项目启动会",
  "description": "...",
  "tags": ["product-strategy"],
  "occurred_at": "2026-08-12T10:00:00+08:00",
  "source": { "kind": "lark_minutes", "ref": "minute_xxx", "url": null },
  "content": "全文...",
  "chunks": [ /* 仅在 --with-chunks 时出现 */ ]
}
```

`--chunk <ord>` 只取单个切片（AI 已知位置时避免拉全文）。

### 3.5 退出码

**无人值守 loop 靠退出码判断成败，必须严格遵守。**

| 码 | 含义 | 典型场景 |
|---|---|---|
| 0 | 成功 | |
| 1 | 一般运行错误 | 未预期异常 |
| 2 | 用法错误 | 参数缺失或非法 |
| 3 | 依赖不可用 | Postgres 连不上、TEI/Ollama 不可达 |
| 4 | 未找到 | `kb get` 的 id 不存在 |
| 5 | 部分失败 | 批量入库中部分条目失败（详情落 `parse_failures`） |

**搜索无结果返回 0，不是 4。** 「没查到」是正常结果，不是错误——否则自动化会把空结果当故障处理。

### 3.6 `kb doctor`

程序化的前置检查，对应 [plan-loop-engineering.md](../plans/plan-loop-engineering.md) 第 7 节的人工清单。

逐项检查并报告：Postgres 连接与迁移版本、pgvector 扩展、TEI 可达性与模型名、Ollama 可达性与模型是否就绪、飞书授权状态、配置来源。

```powershell
kb doctor            # 人类可读，逐项 ok/fail
kb doctor --json     # 结构化，供脚本判断
```

任一必需项失败退出码为 3。**可选项失败不影响退出码**——TEI 和 Ollama 离线时读路径仍应可用（ADR-001 红线第 2 条），`doctor` 应报告为 `degraded` 而非 `fail`。

### 3.7 配置与双模式

优先级：命令行参数 > 环境变量 > 配置文件 > 默认值。

| 变量 | 用途 |
|---|---|
| `KB_DATABASE_URL` | 本地模式的 Postgres 连接串 |
| `KB_REMOTE_URL` | 远程模式的 API 地址 |
| `KB_REMOTE_TOKEN` | 远程模式的凭据（`Authorization: Bearer`） |
| `KB_API_TOKEN` | API 进程校验的共享密钥，与客户端 `KB_REMOTE_TOKEN` 同值 |
| `KB_API_HOST` | API 监听地址，默认 `127.0.0.1` |
| `KB_API_PORT` | API 端口，默认 `8787` |
| `KB_TEI_URL` | TEI 容器地址，默认 `http://localhost:8080` |
| `KB_EMBED_MODEL` | 灌入时记录的 embedding 模型名，默认 `BAAI/bge-m3`；以 TEI `/info` 的 `model_id` 为准 |
| `KB_RERANK_ENABLED` | 是否对召回结果做 Stage 3 重排，默认 `0`。评测未见排序收益，见 [eval-rerank-2026-08-21.md](../audits/eval-rerank-2026-08-21.md) |
| `KB_RERANK_URL` | 重排服务地址，默认 `http://localhost:8082`。不要指向 embedding 容器的 `:8080` |
| `KB_RERANK_MODEL` | 重排模型名（compose 使用），默认 `BAAI/bge-reranker-v2-m3` |
| `KB_RERANK_TIMEOUT_MS` | 重排超时，默认 `3000`。超时则返回召回顺序 |
| `KB_RERANK_CANDIDATES` | 送入重排的候选上限，默认 `20` |
| `KB_OLLAMA_URL` | Ollama 地址，默认 `http://localhost:11434` |
| `KB_LLM_MODEL` | 提炼模型，默认 `qwen3:8b` |

**模式选择**：给了 `--remote` 或设了 `KB_REMOTE_URL` 走远程；否则走本地直连。

非技术同事的完整配置只有两项：`KB_REMOTE_URL` 与 `KB_REMOTE_TOKEN`。这是选择 monorepo 架构的原因（ADR-001 D2）。

> 远程模式：`--remote` 或设置 `KB_REMOTE_URL` 时，`search` / `get` / `tags list` 走 HTTP API，不需要本机 `KB_DATABASE_URL`。入库命令仍是本地。启动 API：`pnpm api`（需 `KB_API_TOKEN` 与 `KB_DATABASE_URL`）。HTTP 路径：`GET /health`（无鉴权）、`GET /tags`、`GET /search?query=`、`GET /documents/:id`。不可达退出码 3；凭据错误退出码 1。

### 3.8 人类可读输出

默认输出为表格，`search` 结果每条占 2-3 行：id、标题与类型、命中片段（截断）。

强制要求（`code-style.md`「错误要可见」）：失败时必须给出可定位的信息——涉及的 id、实际查询、文件路径或 URL。禁止空 catch，禁止只打印 `Error`。

### 3.9 MCP（stdio）

`kb mcp` 启动只读 MCP server。工具名：`tags` / `search` / `get`。返回 JSON 与对应 CLI `--json` 契约相同。search **不含** `content`。

接入配置见 [docs/ops/mcp.md](../ops/mcp.md)。启动命令必须用 `node --experimental-strip-types …/apps/cli/src/index.ts mcp`，不要用 `pnpm kb mcp`（pnpm 会污染 stdout）。

---

## 4. 验收命令

各 Loop 的 DoD 引用本节。

**Loop 2（垂直切片打通）**

```powershell
pnpm kb ingest file ./fixtures/sample-meeting.md   # 退出码 0
pnpm kb search "产品力" --json                      # 退出码 0，results 非空
pnpm kb get <上一步返回的 id> --json                # 退出码 0，content 非空
pnpm kb get no-such-id                             # 退出码 4
pnpm kb search "不可能出现的词xyzzy" --json          # 退出码 0，results 为空数组
```

**Loop 6（向量接入后，验证降级仍可用）**

```powershell
docker compose stop tei
pnpm kb search "产品力" --json    # 退出码 0，stage=fulltext，degraded=true
```

这条是 ADR-001 红线第 2 条的机械化验证，**必须有**。

---

## 5. 风险

| 风险 | 缓解 |
|---|---|
| `--json` 与人类输出行为漂移 | 两者共用同一份结果对象，仅格式化层不同；禁止在格式化层做过滤或补算 |
| 业务逻辑渗入命令处理函数 | 判据：删掉 `apps/cli` 后 `packages/core` 测试仍全绿（ADR-001 红线第 1 条） |
| 退出码被随手改动 | 退出码常量集中定义并有测试断言；它是自动化的契约 |
| 命令面在 Loop 5 前不完整 | `description` 与 `tags` 允许为 null，消费方必须容忍空值 |
