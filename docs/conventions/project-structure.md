# 项目结构与文件组织

> Created: 2026-08-20
> Updated: 2026-08-21
>
> 本文档是 `AGENTS.md` 中 Project Structure 的完整版。
> 文件放置的判断方法见 [code-size-and-organization.md](./code-size-and-organization.md)。
>
> **源码布局已于 2026-08-21 拍板**：pnpm workspace monorepo，见 [ADR-001 D2](../designs/adr-001-tech-stack-and-architecture.md)。Web UI 框架仍未决策。

## 当前目录结构

```
.
├── packages/
│   └── core/            # 入库、切分、检索、数据访问 —— 唯一的业务逻辑所在
├── apps/
│   ├── cli/             # 命令行门面（含 MCP server）
│   ├── api/             # HTTP 门面（团队共享 / Web 后端）—— Loop 9
│   └── web/             # Web UI —— 框架未决策，勿提前铺开
├── docs/
│   ├── plans/           # 项目计划、路线图、里程碑
│   ├── conventions/     # 项目规范与团队协作（本文所在目录）
│   ├── updates/         # 更新日志、变更记录
│   ├── specs/           # 技术规格
│   ├── audits/          # 审计报告
│   ├── ops/             # 运维指南（本地运行 / 部署，待写）
│   ├── issues/          # 问题追踪与技术债务归档
│   └── designs/         # 方向草案、方案对比、架构决策
├── scripts/
│   ├── setup/           # 环境初始化
│   ├── build/           # 构建辅助
│   ├── deploy/          # 部署辅助
│   └── dev/             # 开发辅助、mock、调试
├── AGENTS.md            # AI 操作索引（短文）
├── README.md            # 人类入口
└── .gitignore
```

尚未创建（等后续决策，禁止按某一框架默认铺开）：

- **前端路由层、UI 组件层**——Web UI 框架未决策，`apps/web/` 内部结构留空
- 部署配置（云平台 json、容器编排的生产版本）——部署平台未决策

## 分层规则（已生效）

- `docs/` 只放内部文档；每个子目录有 README 说明用途
- `docs/designs/` 放方向草案与尚未拍板的方案对比；拍板后的实现规格去 `specs/`
- `docs/conventions/` 放稳定的编码与协作规范；AGENTS.md 只做索引，不复制长文
- `scripts/` 按 setup / build / deploy / dev 分类；危险操作必须有确认
- 单模块专用代码就近放置；跨模块领域能力才提升（见代码组织规范）
- 原始音视频、密钥、大于 25 MB 的文件不进 git

## 分层规则（2026-08-21 补入）

- **业务逻辑一律在 `packages/core`。** CLI、API、MCP 都只是门面：解析入参 → 调 core → 格式化输出
  - 判断标准：删掉 `apps/cli` 后 `packages/core` 的测试应全部照常通过
  - 反例：把「先查全文，没结果再查向量」的编排写在 CLI 命令函数里
- **入库流水线、检索、数据访问同属 core**，按领域分子目录，不按技术分层切
- **共享类型跟着 core 走**，不单独立 `types` 包——它是 core 的公开 API 的一部分
- **测试就近放置**，与被测文件同目录；跨模块的集成测试放 `packages/core/tests/`
- **调试隔离区**：原型与一次性脚本放 `scripts/dev/`；正式路径不得引用（单向依赖）

仍待决策：`apps/web/` 内部结构（框架未定）、部署配置布局（平台未定）。

## 文件放置决策

详见 [code-size-and-organization.md](./code-size-and-organization.md) 的决策树。
