# Knowledge-Base-RAG —— Summer-Sum

> 轻量内部知识检索：把假期会议文稿和已解析链接收进同一套索引，用 CLI + Web UI 快速定位原文。

## 项目简介

本仓库对应内部知识检索工具 **Knowledge-Base-RAG —— Summer-Sum**（启动会代号 LG 已弃用）。目标是覆盖假期项目的会议录音转写与链接解析文本，做能回原文的检索，而不是替代团队内已有的大型整理平台。

产品方向仍是草案，见 [docs/designs/working-direction.md](docs/designs/working-direction.md)。

### 核心能力

- **多源检索**：会议转写文稿与入库前解析的链接摘要统一查询
- **标签**：入库打标，不完全依赖全文语义匹配
- **定位回原文**：结果带上下文，并指向原文 / 原链接
- **CLI**：本地命令行检索，不依赖打开网页
- **Web UI**：搜索框 + 卡片结果（筛选与时间轴为后续）

### 检索方式

核心交互是**渐进式披露**，而非把检索碎片一次性塞进 AI 上下文：

1. `kb tags` —— 先了解知识库有哪些维度
2. `kb search <query>` —— 返回文档级卡片（id、标题、一句话摘要、标签、命中片段）
3. `kb get <id>` —— 判断相关后，按 id 精确取全文

这套接口同时服务人和 AI Agent（`--json` 输出 + MCP server）。MCP 接入见 [docs/ops/mcp.md](docs/ops/mcp.md)。

## 技术栈

架构已于 2026-08-21 拍板，完整决策与理由见 [ADR-001](docs/designs/adr-001-tech-stack-and-architecture.md)。

| 层 | 选型 |
| --- | --- |
| 语言 / 运行时 | TypeScript + Node.js（strict） |
| 仓库形态 | pnpm workspace monorepo：`packages/core` + `apps/{cli,api,web}` |
| 数据库 | PostgreSQL + pgvector（本地 Docker） |
| 全文检索 | Postgres `tsvector`，中文分词走 Node 内置 `Intl.Segmenter` |
| 向量 / 重排 | TEI 容器（本地，OpenAI 兼容接口） |
| 入库提炼 | 本地 Ollama（`qwen3:8b`），provider 可插拔 |

**仍未决策**：Web UI 框架、部署平台、线上鉴权。选了 TypeScript **不等于**默认 Next.js。

### 设计要点

- **读写路径分离**：LLM 只在入库时参与（生成摘要与标签）；检索路径无模型依赖，因此毫秒级、零成本、可写自动化测试
- **三层检索**：全文+标签 → 向量 → 重排，接口可替换，全文层永远作为兜底
- **回到原文**：切片存字符偏移量；会议切片额外存说话人与时间戳
- **语料边界**：飞书官方 API 可读妙记/纪要与群内链接文件；**任何人的聊天发言原文不入库**

## 仓库约定

面向协作者与 AI 代理：

- [AGENTS.md](./AGENTS.md) — 操作索引（短）；细则在 `docs/conventions/`
- [docs/](./docs/) — 内部文档分类
- [scripts/](./scripts/) — 辅助脚本分类（目前仅占位）

本地默认环境是 **Windows + PowerShell**。

## 快速开始

> 应用骨架正在落地中，部分命令尚不可用。前置要求：Node 22+、pnpm 10+、Docker。

```powershell
pnpm install
docker compose up -d        # Postgres + pgvector
pnpm db:migrate
pnpm kb doctor              # 检查各依赖是否就绪
```

先读这三份文档再动手：[ADR-001](docs/designs/adr-001-tech-stack-and-architecture.md)（架构约束）、[AGENTS.md](./AGENTS.md)（操作索引）、[working-direction.md](docs/designs/working-direction.md)（产品方向）。

## 文档

| 路径 | 用途 |
| --- | --- |
| [docs/designs/](./docs/designs/) | 架构决策（ADR）、方向草案、方案对比 |
| [docs/plans/](./docs/plans/) | 推进机制、计划与里程碑 |
| [docs/specs/](./docs/specs/) | 数据模型、CLI 命令面等技术规格 |
| [docs/conventions/](./docs/conventions/) | 编码与协作规范 |
| [docs/ops/](./docs/ops/) | 本地运行与部署（待写） |

## License

MIT
