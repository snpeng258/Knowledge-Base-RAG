# 代码风格规范

> Created: 2026-08-20
> Updated: 2026-08-21
>
> 本文档是 `AGENTS.md` 中代码风格条款的完整版。
> 长度与文件组织见 [code-size-and-organization.md](./code-size-and-organization.md)。
>
> 语言已定为 **TypeScript**（strict），见 [ADR-001](../designs/adr-001-tech-stack-and-architecture.md)。**Web UI 框架与样式方案仍未定**——不要在此预写 Next.js / React / Tailwind 规则，等 Web 阶段决策后另开专文。

## 命名与结构

- 文档与脚本文件名使用 kebab-case（如 `working-direction.md`、`check-index-size.sh`）
- 标识符用领域语言：检索、文稿、标签、来源，避免无意义缩写
- 命名导出优先于「文件即默认导出」的习惯，除非所选框架强制默认导出
- 公开 API（CLI 子命令、HTTP 路径、入库字段）一旦出现，变更要记入 `docs/updates/` 或对应 spec

## 注释与提交信息

- 注释写「为什么」，不复述代码「做了什么」
- 无自然接缝却超过审视阈值的文件/函数，顶部用一行说明为何不拆
- Commit 使用 Conventional Commits：`type(scope): description`

## 正确性与质量

- 新行为要有可重复验证手段（测试、最小脚本或手工验收步骤写进 PR）
- 在测试/lint 工具引入之前，不假装已经有 CI 绿灯
- TypeScript strict；禁止把类型检查关掉当功能开关；禁止 `any`（含把值断言成 any），用 `unknown` + 类型收窄
- `pnpm typecheck` 与 `pnpm test` 必须通过，不得用忽略规则或跳过标记糊过去
- 错误要可见：失败时给出能定位的信息（来源 id、查询、文件路径），不要空 catch

## 安全与数据边界

- 不提交密钥、cookie、账号、内网 token
- 不把原始会议音视频打进仓库；用链接或后续对象存储
- 不实现、不记录微信/飞书聊天记录的非官方导出或解密步骤
- 链接内容只在**入库前**解析；检索路径不出现「现爬网页」

## 调试代码

- 原型和一次性调试放在明确隔离的位置（目录名待定）
- 正式路径不得引用调试模块（单向引用）
- 调试入口在生产环境必须不可达

## 与周围代码一致

- 先匹配已有文件的格式与抽象级别，再引入新模式
- 需要新模式时，先改 conventions 或 designs，再铺开到多处
