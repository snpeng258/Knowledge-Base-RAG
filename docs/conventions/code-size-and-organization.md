# 代码长度与文件组织规范

> Created: 2026-08-20
> Updated: 2026-08-21
>
> 本文档是 `AGENTS.md` 中「代码长度」与「文件放置」条款的完整背景说明。
> AGENTS.md 是面向 AI 编码代理的精简操作策略，本文档面向人类开发者，提供理由、阈值与判断方法。
> 本仓库技术栈已于 2026-08-21 拍板（见 [ADR-001](../designs/adr-001-tech-stack-and-architecture.md)）。以下规则是跨栈通用的判断方法，**不绑定**任何框架的目录名；具体目录见 [project-structure.md](./project-structure.md)。

## 一、核心原则

### 1. 长度是触发器，不是规则

> **Length is a trigger to look, never a rule to obey.**
> —— [human-readable-code](https://github.com/jwmurray/human-readable-code)

长文件/长函数是**代码异味**，不是**违规**。本质问题是认知复杂度，不是行数。

- 超过阈值 → 停下来审视，找**自然接缝**
- 自然接缝 = 一个可独立命名的职责能干净分离的点
- 有真实接缝 → 拆分
- 没有真实接缝 → 保持完整，留一行注释说明原因
- **永远不要为了凑数字而拆** —— 人为拆分比一个诚实的大文件更糟

### 2. 函数长度与复杂度成反比

> The maximum length of a function is inversely proportional to the complexity and indentation level of that function.
> —— [Linux Kernel Coding Style](https://kernel.org/doc/html/latest/process/coding-style.html)

- 概念简单的线性流程（如长 switch/case）可以稍长
- 复杂、高嵌套的函数必须更短
- 人脑同时能跟踪约 7 件事，超过就容易混乱

### 3. 文件放置由使用范围决定，不由行数决定

> A file should live as close as possible to where it's used.

优先就近放置。共享层只放**真正跨模块**的东西。不要因为「这个文件变长了」就提升到 `lib/`、`shared/` 或未来的 `features/`。

## 二、阈值参考

以下数字来自业界经验（ESLint `max-lines`、human-readable-code、clean-code 文献），**每个数字都读作「在这里看一眼」，不是「在这里服从」**：

| 维度 | 软目标 | 停下来审视 | 拆分或说明原因 |
|---|:---:|:---:|:---:|
| 函数长度 (LOC) | ~50 | ~60 | 80+ |
| 文件长度 (LOC) | ~400 | ~600 | 800+ |
| 圈复杂度 | ≤5 | >10 | >15 |
| 嵌套深度 | ≤3 | 4 | 5+ |
| 函数参数 | ≤4 | 5 | 6+ |

- 不存在客观的最大行数；推荐区间常被引用为 100–500 行，目的是可维护、降复杂度
- 本项目**不启用**按行数卡死的 lint 规则，避免诱导机械拆分
- 这些阈值仅作为 code review 时的审视提示

## 三、文件放置决策树

```
这段代码被谁使用？
│
├─ 只被一个模块 / 入口使用
│   └─ 与该模块放在一起（colocation）
│      ※ 无论文件多长都先留在原地，不要因为「太长」就提升
│
├─ 同一父模块下多个子模块共用
│   └─ 上移到共同父目录
│
├─ 跨多个不相关模块的领域能力（可独立删除/迁移）
│   └─ 提升到领域目录（具体路径等架构决策后写入 project-structure.md）
│      ※ 判断依据是「领域边界」，不是「文件长度」
│      ※ 领域目录不是长文件回收站
│
├─ 无业务逻辑的纯展示件或纯工具
│   └─ 跨模块的工具进 `packages/core`；纯 UI 件等 Web 阶段再定
│
└─ 文档与脚本
    └─ 分别放 docs/ 与 scripts/ 已有分类，不要塞进业务目录
```

**提升到领域共享层的条件（全部满足）**：

1. 该领域是一个可独立命名的业务概念
2. 跨多个不相关模块复用
3. 可作为整体删除或迁移而不影响其他领域

**不应提升的情况**：

- 单模块专用代码变长了 → 留在模块内拆
- 两个模块共用一个小函数 → 上移到共同父级或未来的工具层
- 只是「某文件超过 200 行」 → 这不是提升理由

## 四、拆分判断方法

当文件/函数触发审视阈值时，按以下顺序判断：

1. **找自然接缝**：是否存在可独立命名的职责，能干净分离且不产生循环依赖？
   - 是 → 按职责拆分
   - 否 → 进入第 2 步
2. **判断是否职责混杂**：是否同时承担数据获取 / 编排 / 展示 / I/O 等多个关注点？
   - 是 → 按关注点拆分
   - 否 → 进入第 3 步
3. **保留完整并注释**：内聚良好、无自然接缝，保持完整，在顶部说明为何不拆

**禁止的拆分模式**：

- 为凑行数把一个内聚函数切成三段
- 把单模块代码提升到共享层只因为「太长」
- 按文件类型机械拆分（把同一职责的渲染、样式、逻辑拆到三个互找的文件）

## 五、参考来源

- [ESLint max-lines 规则文档](https://eslint.org/docs/latest/rules/max-lines)
- [Linux Kernel Coding Style](https://kernel.org/doc/html/latest/process/coding-style.html)
- [human-readable-code](https://github.com/jwmurray/human-readable-code)
- [Small Files Are Your Friends — Codecraft](https://codecraft.co/small-files-are-your-friends.html)

框架相关的 colocation 细则（例如某前端路由目录是否「安全同居」）等架构落地后再补附录，不在本文预设。
