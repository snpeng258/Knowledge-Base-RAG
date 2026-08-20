# scripts/setup/

环境初始化脚本。

> Created: 2026-08-20
> Updated: 2026-08-21

## 用途

- 依赖安装
- 从 `.env.example` 生成本地 env
- Git hooks
- 开发环境检查与修复

技术栈已定（见 [ADR-001](../../docs/designs/adr-001-tech-stack-and-architecture.md)）。本目录随骨架落地按需补充脚本。

**注意**：运行时依赖的健康检查（PostgreSQL / TEI / Ollama / 飞书授权）由 `kb doctor` 命令承担，不要在这里另写一套——见 [cli-surface.md](../../docs/specs/cli-surface.md) §3.6。
