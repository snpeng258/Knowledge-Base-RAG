# 项目结构与文件组织

> Created: 2026-08-20
> Updated: 2026-08-20
>
> 本文档是 `AGENTS.md` 中 Project Structure 的完整版。
> 文件放置的判断方法见 [code-size-and-organization.md](./code-size-and-organization.md)。
>
> **源码布局、包管理器、Web/CLI 是否 monorepo 均未决策。** 本节只描述仓库里已经立住的通用骨架。

## 当前目录结构

```
.
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

尚未创建（等架构决策，禁止按某一框架默认铺开）：

- 应用源码根（例如 `src/`、`apps/`、`packages/`、`cmd/`）
- 前端路由层、UI 组件层、server-only 层
- 包管理与部署配置（`package.json`、`pyproject.toml`、`go.mod`、云平台 json 等）

## 分层规则（已生效）

- `docs/` 只放内部文档；每个子目录有 README 说明用途
- `docs/designs/` 放方向草案与尚未拍板的方案对比；拍板后的实现规格去 `specs/`
- `docs/conventions/` 放稳定的编码与协作规范；AGENTS.md 只做索引，不复制长文
- `scripts/` 按 setup / build / deploy / dev 分类；危险操作必须有确认
- 单模块专用代码就近放置；跨模块领域能力才提升（见代码组织规范）
- 原始音视频、密钥、大于 25 MB 的文件不进 git

## 分层规则（待架构决策后补）

以下条目**故意留空**，写入时走 `docs/designs/` 决策，再回填本节：

- CLI、Web UI、检索 API、入库流水线各放哪棵树
- 共享类型 / 检索核心是否单独成库
- 测试目录约定
- 调试隔离区（原则：调试代码不得被正式路径引用）

## 文件放置决策

详见 [code-size-and-organization.md](./code-size-and-organization.md) 的决策树。
