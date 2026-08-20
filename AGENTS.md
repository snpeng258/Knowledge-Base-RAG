# AGENTS.md — Knowledge-Base-RAG —— Summer-Sum

> 轻量内部知识检索：会议文稿与链接解析文本统一检索，CLI + Web UI 定位原文。
> 本文件是 AI 编码代理的**操作索引**——只放最高频命令和不可省略的硬规则。
> 详细规范在 `docs/` 下按需查阅，见末尾 [Documentation Index](#documentation-index)。

## Current Stance

- **产品方向**（非终稿）：[docs/designs/working-direction.md](docs/designs/working-direction.md)
- **技术栈**：**已拍板**（2026-08-21）。TypeScript + Node.js · pnpm workspace monorepo · PostgreSQL + pgvector · TEI 容器做 embedding/rerank · 本地 Ollama 做入库提炼。完整决策与理由见 [ADR-001](docs/designs/adr-001-tech-stack-and-architecture.md)。
- **推进方式**：issue 驱动的 Loop Engineering，见 [plan-loop-engineering.md](docs/plans/plan-loop-engineering.md)。
- **仍未决策**：部署平台、线上鉴权、**Web UI 框架**（选了 TypeScript ≠ 默认 Next.js）。见 working-direction §9.2。
- **未同步（刻意删除）**：Next.js 16 模式、`src/app` 骨架、`edgeone.json`、SSG/`out/` 部署规范。本仓库不适用。

## Key Commands

> 骨架落地前部分命令尚不可用。命令面规格见 [cli-surface.md](docs/specs/cli-surface.md)。

```powershell
pnpm install                # 安装依赖（workspace 根目录）
pnpm typecheck              # 类型检查，必须无错
pnpm test                   # 测试，必须全绿
docker compose up -d        # 起 Postgres（+ 可选 TEI）
pnpm db:migrate             # 跑数据库迁移

pnpm kb doctor              # 健康检查：PG / TEI / Ollama / 飞书授权
pnpm kb search "<query>"    # 检索，返回文档卡片
pnpm kb get <id>            # 按 id 取全文
pnpm kb tags                # 列出标签词表
```

- 读路径（`search` / `get` / `tags`）**不得**依赖 LLM 或 TEI；它们离线时必须降级到全文检索仍可用
- 加 `--json` 得到结构化输出（供 AI Agent 消费）；退出码契约见 cli-surface.md §3.5
- 不要引入 Next.js / EdgeOne 脚手架——Web 框架仍未决策

## Shell Environment

> 本地开发环境是 **Windows + PowerShell**，不是 bash/zsh。

- **不要用 `&&` 串联命令** — PowerShell 中 `&` 是调用运算符。用 `;` 分隔，或 `cmd1; if ($?) { cmd2 }`
- **不要用 bash heredoc (`<<'EOF'`)** 写多行 commit message。用 `git commit -F <file>` 配合临时文件
- **不要用 `&&`、`||`、`!` 做 shell 条件判断** — 用 `-and`、`-or`、`-not`，或 `if ($?)`
- 路径用 `\` 或 `/` 均可，含空格的路径必须用双引号包裹

### 中文编码陷阱（实测记录，2026-08-21）

本机是 PowerShell 5.1 + GB2312 控制台，**没有 pwsh 7**。以下两点已踩过，不要重复：

- **含中文的 `.ps1` 脚本必须带 UTF-8 BOM**，否则 PS 5.1 按 ANSI 读取，中文被破坏并引发诡异的语法错误。用 `[System.IO.File]::WriteAllText($path, $text, (New-Object System.Text.UTF8Encoding($true)))` 写入
- **`gh` 等工具输出的中文在本地终端会显示成乱码，但远端数据通常是正确的。** 这是 PowerShell 按 GB2312 解码 UTF-8 字节流造成的显示假象。**看到乱码先别急着"修复"**——用 WebFetch 打开对应网页核对真实内容，避免把好数据改坏
- 给外部命令传中文参数不可靠时，改用文件传递（如 `gh issue create --body-file`、`gh api --input`）

## Definition of Done

1. `pnpm typecheck` 与 `pnpm test` 通过（不得用忽略规则糊过去）
2. 未把**仍未决策**的选项写成既成事实（Web 框架、部署平台）
3. 未违反 [ADR-001](docs/designs/adr-001-tech-stack-and-architecture.md) 第 6 节红线
4. 不提交密钥、`.env*`（`.env.example` 除外）、真实语料、大于 25 MB 的文件
5. Commit 遵循 Conventional Commits：`type(scope): description`
6. 约定变更时同步 `docs/conventions/` 与本索引，不把长文塞进 AGENTS.md
7. 公开接口（CLI 子命令、退出码、入库字段）变更时同步对应 spec

## When Blocked

- 需要选定 **Web UI 框架、部署平台、线上鉴权** → **停止并提问**，见 [working-direction.md](docs/designs/working-direction.md) §9.2。语言、仓库形态、数据库、向量方案**已定**，见 ADR-001
- 需要引入 ADR 未涵盖的重要依赖 → 停止并提问
- 规范与产品草案冲突 → 停止并指出冲突，不要默默改其中一方
- Merge conflicts → 停止并列出冲突文件
- **无人值守执行时**：按 [plan-loop-engineering.md](docs/plans/plan-loop-engineering.md) 第 6 节的阻塞处置矩阵自主判断。环境/实现类问题可自行解决，**决策类一律记录后跳过，绝不自行拍板**
- **Never**：force push、跳过已约定检查、删除远程、把聊天记录导入方案写进代码

## Project Structure

```
packages/core/   入库、切分、检索、数据访问 —— 唯一的业务逻辑所在
apps/cli/        命令行门面（含 MCP server）
apps/api/        HTTP 门面（团队共享 / Web 后端）—— Loop 9 才落地
apps/web/        Web UI —— 框架未决策，勿提前铺开
docs/            项目内部文档（设计 / 规范 / 计划 / 规格 / 运维 / 审计）
scripts/         辅助脚本（setup/build/deploy/dev）
AGENTS.md        本索引
README.md        人类入口
```

**最重要的结构纪律**：业务逻辑不进门面层。CLI / API / MCP 只做解析入参、调 `packages/core`、格式化输出。判断标准——**删掉 `apps/cli` 后 `packages/core` 的测试应全部照常通过**。

完整放置原则见 [project-structure.md](docs/conventions/project-structure.md) 与 [code-size-and-organization.md](docs/conventions/code-size-and-organization.md)。

## Critical Rules

- **遵循 ADR-001**：架构已拍板，不得自行改动决策。发现决策有问题 → 记录并提问，不要改文档再照新决策实现
- **未决策仍先问**：Web UI 框架、部署平台、线上鉴权。选了 TypeScript **不等于**默认 Next.js
- **业务逻辑不进门面层**：CLI / API / MCP 都只是 `packages/core` 的薄门面
- **读路径不依赖 LLM**：`search` / `get` / `tags` 在 Ollama 与 TEI 全部离线时必须降级可用
- **检索接口必须可替换**：三层检索通过同一接口对外，禁止把 pgvector 查询直接写进业务流程
- **tags 只能从受控词表选**：禁止让 LLM 自由生成标签，新词进待确认队列
- **就近放置**：文件放在使用者旁边；不要因为「文件太长」就提升到共享层
- **长度是触发器不是规则**：超阈值先找自然接缝；没有接缝就留注释说明，禁止为凑行数而拆
- **禁止 `any` 逃生舱**：TypeScript strict，用 `unknown` + 收窄，而不是关掉检查
- **密钥与语料不进库**：真实语料走 `corpus/`（已 gitignore），测试只用脱敏 fixture
- **语料边界**：飞书**官方 API + 本人授权**可读妙记/纪要与群内链接文件；**任何人的聊天发言原文不入库**；破解与非官方导出一律禁止（详见 [ADR-001 §8](docs/designs/adr-001-tech-stack-and-architecture.md)）

> 风格细则：[code-style.md](docs/conventions/code-style.md)
> Review 清单：[code-review.md](docs/conventions/code-review.md)

## Git Workflow

- 从 `main` 切出，前缀 `feat/`、`fix/`、`chore/`、`docs/`
- Commit: Conventional Commits（例：`docs(design): record working direction`）
- Squash merge PR；PR 需经过审查（CI 引入后须通过）

### Issue 与 PR 协作（强制 skill）

创建 issue、处理 issue 驱动开发、创建 PR 时，**必须先调用对应 skill**，不要自行发挥流程。

- **创建 issue / 拆 issue / 创建子 issue** → `/agents:issue-to-pr` 或 `/claude:issue-creator`
- **根据 issue 做 PR / issue 驱动开发** → `/agents:issue-to-pr`

## Boundaries

### Allowed without asking

- 读取文件、列出目录
- 修改 `docs/` 下已有分类中的文档（方向草案、规范、计划）
- 在 `scripts/` 已有分类下新增无破坏性辅助脚本
- 在 `packages/core`、`apps/cli` 内新增或修改业务代码（遵守 ADR-001 与 conventions）
- 在 ADR/spec 已规划范围内新增文件与子目录

### Ask first

- 更换语言、包管理器；选定 Web UI 框架或部署平台
- 安装 ADR/spec 未提及的新依赖
- 删除文件；新增 ADR 未规划的**顶层**目录
- Push、创建 PR、改远程

### Never

- 提交 `.env*`、任何密钥/凭据、真实语料
- Force push 到 `main` 或受保护分支
- 把超过 25 MB 的文件或原始音视频提交进 git（见 `.gitignore`）
- 把 demo-init 的 Next.js / EdgeOne 规则当作本仓库现行规范
- 实现微信/飞书聊天记录破解或非官方导出
- **把任何人的聊天发言原文入库**（官方 API 也不行，理由是权属而非技术，见 ADR-001 §8）
- 自行更改 ADR-001 的架构决策

## Key Files

- [docs/designs/adr-001-tech-stack-and-architecture.md](docs/designs/adr-001-tech-stack-and-architecture.md) — **架构决策，所有实现的约束来源**
- [docs/plans/plan-loop-engineering.md](docs/plans/plan-loop-engineering.md) — 推进机制与阻塞处置
- [docs/specs/data-model.md](docs/specs/data-model.md) · [cli-surface.md](docs/specs/cli-surface.md) — 数据与命令面规格
- [docs/designs/working-direction.md](docs/designs/working-direction.md) — 阶段性产品方向草案
- [docs/conventions/](docs/conventions/) — 通用规范正文
- `.gitignore` — 密钥、构建产物、媒体、语料
- `README.md` — 项目入口

## Documentation Index

> 按需查阅，不要一次性读完 `docs/`。

### docs/designs/ — 方向与设计

- [adr-001-tech-stack-and-architecture.md](docs/designs/adr-001-tech-stack-and-architecture.md) — **技术栈与分层架构决策**（实现前必读）
- [working-direction.md](docs/designs/working-direction.md) — 阶段性产品方向草案

### docs/plans/ — 计划

- [plan-loop-engineering.md](docs/plans/plan-loop-engineering.md) — issue 驱动的循环推进机制、DoD 规范、熔断与阻塞处置
- [night-run-prompt.md](docs/plans/night-run-prompt.md) — 夜间无人值守执行提示词（可直接复制使用）

### docs/specs/ — 技术规格

- [data-model.md](docs/specs/data-model.md) — 数据库 schema、幂等与偏移量约束
- [cli-surface.md](docs/specs/cli-surface.md) — CLI 命令面、输出契约、退出码

### docs/conventions/ — 项目规范

- [code-size-and-organization.md](docs/conventions/code-size-and-organization.md) — 代码长度与文件组织
- [project-structure.md](docs/conventions/project-structure.md) — 目录与分层
- [code-style.md](docs/conventions/code-style.md) — 通用代码风格
- [code-review.md](docs/conventions/code-review.md) — Review 检查清单

### 其他 docs/ 分类

运维 `ops/` · 审计 `audits/` · 问题 `issues/` · 更新 `updates/`
