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

### 研究方向

- 语言、框架、仓库形态（monorepo / 分目录）、检索实现（关键词 / 向量）、部署平台均**尚未决策**，见方向草案第 9 节。
- 本期明确不做：微信/飞书聊天记录导入、查询时实时爬网页、把 LLM 作为检索前提。

## 技术栈

**未定。** 不要从本 README 或历史脚手架推断为 Next.js / EdgeOne。架构决策将写入 `docs/designs/` 与 `docs/specs/`，并回填本节。

## 仓库约定

面向协作者与 AI 代理：

- [AGENTS.md](./AGENTS.md) — 操作索引（短）；细则在 `docs/conventions/`
- [docs/](./docs/) — 内部文档分类
- [scripts/](./scripts/) — 辅助脚本分类（目前仅占位）

本地默认环境是 **Windows + PowerShell**。

## 快速开始

应用代码尚未落地。当前可做的事：

1. 阅读 [docs/designs/working-direction.md](docs/designs/working-direction.md)
2. 阅读 [AGENTS.md](./AGENTS.md)
3. 架构决策后再补安装与运行命令

## 文档

| 路径 | 用途 |
| --- | --- |
| [docs/designs/](./docs/designs/) | 方向草案、方案对比、架构决策 |
| [docs/conventions/](./docs/conventions/) | 编码与协作规范 |
| [docs/plans/](./docs/plans/) | 计划与里程碑 |
| [docs/specs/](./docs/specs/) | 技术规格 |
| [docs/ops/](./docs/ops/) | 本地运行与部署（待写） |

## License

MIT
