# docs/

项目内部文档目录。

> Created: 2026-08-20
> Updated: 2026-08-20

## 目录结构

| 目录 | 用途 |
|---|---|
| [`plans/`](./plans/) | 项目计划、路线图、里程碑 |
| [`conventions/`](./conventions/) | 项目规范、编码约定、团队协作 |
| [`updates/`](./updates/) | 更新日志、变更记录、版本说明 |
| [`specs/`](./specs/) | 技术规格（功能、API、入库格式） |
| [`audits/`](./audits/) | 审计报告（性能、安全、代码） |
| [`ops/`](./ops/) | 运维与操作指南（本地运行、部署、环境） |
| [`issues/`](./issues/) | 问题追踪与技术债务归档 |
| [`designs/`](./designs/) | 方向草案、方案对比、架构与交互设计 |

## 文档规范

- 使用 Markdown
- 文件名使用 kebab-case（如 `working-direction.md`）
- 每个文档开头注明创建日期和最后更新日期（产品草案已有状态栏的可沿用）
- 规格（`specs/`）建议包含：背景、目标、方案、风险
- 设计（`designs/`）建议包含：问题陈述、方案对比、最终决策、决策理由
- 不要把未决策的技术栈写进 `conventions/` 当成现行规则
