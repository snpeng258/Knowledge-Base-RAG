# AGENTS.md — Knowledge-Base-RAG —— Summer-Sum

> 轻量内部知识检索：会议文稿与链接解析文本统一检索，CLI + Web UI 定位原文。
> 本文件是 AI 编码代理的**操作索引**——只放最高频命令和不可省略的硬规则。
> 详细规范在 `docs/` 下按需查阅，见末尾 [Documentation Index](#documentation-index)。

## Current Stance

- **产品方向**（非终稿）：[docs/designs/working-direction.md](docs/designs/working-direction.md)
- **技术栈**：**未定**。禁止把 demo-init / Next.js / EdgeOne / 某一包管理器当成默认架构。
- **已同步**：通用文档目录、代码组织、风格、评审、Git、Windows PowerShell 约定。
- **未同步（刻意删除）**：Next.js 16 模式、`src/app` 骨架、`edgeone.json`、SSG/`out/` 部署规范。待架构决策后再写适配文档。

## Key Commands

当前仓库尚未引入可运行的应用与包管理器。有命令之后再回填本节。在此之前：

- 不要擅自执行 `pnpm create`、`npx create-next-app` 或等价脚手架
- 不要为了「先跑起来」而选定框架

## Shell Environment

> 本地开发环境是 **Windows + PowerShell**，不是 bash/zsh。

- **不要用 `&&` 串联命令** — PowerShell 中 `&` 是调用运算符。用 `;` 分隔，或 `cmd1; if ($?) { cmd2 }`
- **不要用 bash heredoc (`<<'EOF'`)** 写多行 commit message。用 `git commit -F <file>` 配合临时文件
- **不要用 `&&`、`||`、`!` 做 shell 条件判断** — 用 `-and`、`-or`、`-not`，或 `if ($?)`
- 路径用 `\` 或 `/` 均可，含空格的路径必须用双引号包裹

## Definition of Done

1. 未把未决策的技术栈写成既成事实（文档、依赖、目录骨架都算）
2. 不提交密钥、`.env*`（`.env.example` 除外）、大于 25 MB 的文件
3. Commit 遵循 Conventional Commits：`type(scope): description`
4. 约定变更时同步 `docs/conventions/` 与本索引，不把长文塞进 AGENTS.md
5. 测试 / lint 工具引入之后：相关检查必须通过才算完成

## When Blocked

- 需要选定语言、框架、仓库形态、向量库、部署平台 → **停止并提问**，去读 [working-direction.md](docs/designs/working-direction.md) 第 9 节
- 规范与产品草案冲突 → 停止并指出冲突，不要默默改其中一方
- Merge conflicts → 停止并列出冲突文件
- **Never**：force push、跳过已约定检查、删除远程、把聊天记录导入方案写进代码

## Project Structure（当前）

```
docs/            项目内部文档（方向草案 / 规范 / 计划 / 运维 / 审计）
  designs/       方向草案、方案对比、架构决策
  conventions/   通用编码与协作规范
scripts/         辅助脚本（setup/build/deploy/dev）——目录先立，脚本后补
AGENTS.md        本索引
README.md        人类入口
```

源代码目录（CLI / Web / API / 数据）**尚未划定**。完整放置原则见 [project-structure.md](docs/conventions/project-structure.md) 与 [code-size-and-organization.md](docs/conventions/code-size-and-organization.md)。

## Critical Rules

- **架构未定先问**：不引入 Next.js、Pages Router、EdgeOne SSG、特定 UI 框架作为默认
- **就近放置**：文件放在使用者旁边；不要因为「文件太长」就提升到共享层
- **长度是触发器不是规则**：超阈值先找自然接缝；没有接缝就留注释说明，禁止为凑行数而拆
- **禁止 `any` 式逃生舱**（若使用有类型系统的语言）：用未知类型 + 收窄，而不是关掉检查
- **密钥不进库**
- **语料边界**：不把微信/飞书聊天导出、破解、爬取方案写进仓库

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
- 架构落地之后：修改对应业务代码（仍须遵守 conventions）

### Ask first

- 选定或更换语言、框架、包管理器、部署平台
- 安装或删除依赖
- 删除文件；新增顶层目录（尤其是 `src/`、`apps/`、`packages/`）
- Push、创建 PR、改远程

### Never

- 提交 `.env*` 或任何密钥/凭据
- Force push 到 `main` 或受保护分支
- 把超过 25 MB 的文件或原始音视频提交进 git（见 `.gitignore`）
- 把 demo-init 的 Next.js / EdgeOne 规则当作本仓库现行规范
- 实现微信/飞书聊天记录破解或非官方导出

## Key Files

- [docs/designs/working-direction.md](docs/designs/working-direction.md) — 阶段性方向草案
- [docs/conventions/](docs/conventions/) — 通用规范正文
- `.gitignore` — 密钥、构建产物、媒体文件
- `README.md` — 项目入口

## Documentation Index

> 按需查阅，不要一次性读完 `docs/`。

### docs/designs/ — 方向与设计

- [working-direction.md](docs/designs/working-direction.md) — Knowledge-Base-RAG —— Summer-Sum 阶段性方向草案

### docs/conventions/ — 项目规范

- [code-size-and-organization.md](docs/conventions/code-size-and-organization.md) — 代码长度与文件组织
- [project-structure.md](docs/conventions/project-structure.md) — 当前目录与分层（源码布局待决策）
- [code-style.md](docs/conventions/code-style.md) — 通用代码风格
- [code-review.md](docs/conventions/code-review.md) — Review 检查清单

### 其他 docs/ 分类

计划 `plans/` · 规格 `specs/` · 设计 `designs/` · 运维 `ops/` · 审计 `audits/` · 问题 `issues/` · 更新 `updates/`
