# docs/conventions/

项目规范、编码约定、协作约定。

> Created: 2026-08-20
> Updated: 2026-08-20

## 用途

存放稳定、跨实现细节仍成立的规范：

- 代码长度与文件组织
- 当前仓库目录（不含未决策的源码树）
- 通用代码风格与安全边界
- Code review 清单
- 日后：Git / PR / 分工等团队协作细则（建议文件名 `collaboration.md`）
- 日后：API 设计、文档编写细则

## 现有文档

- [code-size-and-organization.md](./code-size-and-organization.md) — 长度阈值、colocation、拆分判断
- [project-structure.md](./project-structure.md) — 当前目录与分层；源码布局待架构决策
- [code-style.md](./code-style.md) — 通用风格、安全与调试隔离
- [code-review.md](./code-review.md) — Review 检查清单

## 明确不同步

从 demo-init 模板中**未引入**（将在架构决策后按需重写，而不是原样粘贴）：

- Next.js 16 模式（`proxy.ts`、async `params`、SSG `output: 'export'` 等）
- EdgeOne Pages 部署字段与 `buildCommand` 踩坑文
- `src/app/` 路由骨架与 `_dev/` 页面守卫的框架写法

## 与 AGENTS.md 的关系

`AGENTS.md` 是给 AI 代理的短索引。本目录才是完整说明。索引中的硬规则必须能在本目录找到出处，但不要把本目录全文复制进 AGENTS.md。
