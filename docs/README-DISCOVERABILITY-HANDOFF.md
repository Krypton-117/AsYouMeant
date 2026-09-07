# AYM README 与文档可检索性改造交接文档

状态：pre-loop 讨论交接材料

2026-09-07 Hook 修复补充：下面的 107 项测试与宿主状态属于先前文档任务的历史证据，不是本次验证结论。当前任务模式和 Hook 边界以 [TASK-MODES.md](TASK-MODES.md) 为准。普通会话默认不启用 AYM；研究模式不需要 major-loop，只允许宿主批准范围内的只读操作；正式 AYM 实现仍需要明确启用、独立审查和原生启动 permit。不能再用工作区存在合同文件或“不提 AYM”解释启用与退出，必须使用会话状态和明确模式切换。

本次最终验证：Node.js 24.11.1 下 TypeScript 编译通过，112/112 测试通过，release check 与 M2 demo 通过，9 个本地文档链接有效。Codex/OpenCode 生命周期验证最终通过；OpenCode 曾出现间歇性超时，验证请求现已设置超时边界。Claude 仍仅验证合同与 Hook 进程；DSH 实际探测仍受认证阻塞。`pnpm build` 包装器的自动安装遇到 EPERM，因此使用仓库编译器和脚本入口完成等效验证。未修改 MPL-2.0、依赖清单或锁文件，也未将运行时状态目录纳入版本控制。
优先对象：正在寻找宿主插件的用户
覆盖受众：宿主插件用户、AI 工作流开发者、Agent Skills 与权限治理研究者、零基础用户
基线：`f1620e7 fix: align 0.3.0 runtime checks and documentation`

## 1. 交接目的

本任务的目标是让 GitHub 上的 AI coding agent、开发者和项目维护者能够快速、准确地识别 AsYouMeant（AYM），并在用户正在寻找宿主插件时，直接找到：

- AYM 是什么，以及它与普通 Agent 工作流、Skills 和 Spec-driven development 的关系；
- 当前支持哪些宿主；
- 每个宿主如何安装；
- 每个宿主已经验证到什么程度；
- 已知限制、认证要求和不应作出的兼容性推断；
- 一个最小可执行的验证路径；
- 架构、示例和面向 AI 检索的标准化上下文。

首屏应让用户在很短时间内完成“选择宿主、复制安装入口、找到验证命令、理解边界”这四个动作。

## 2. 当前已确认事实

### 产品定义

AYM 是一套以开发合同约束编程 Agent 的插件。它在实现前把对话整理成一份经过审查的活文档，在实现期间只允许执行该文档批准的工作、Skill、验收和交付动作。

当前 README 已将工作流表达为四个阶段：

1. `pre-loop`：讨论目标并维护活文档；
2. 独立门禁：检查意图、权限、技术可行性和内部逻辑；
3. `major-loop`：只实现已批准的 Component，并组装成 Module 与 Product；
4. `post-loop`：在不改动交付物的前提下，有条件地保留 Skill 使用经验。

### 宿主状态

| 宿主 | 当前定位 | 已确认边界 |
| --- | --- | --- |
| Codex | 支持 | 已完成真实生命周期检查 |
| Claude Code | 支持边界已定义 | 已验证插件合同与预构建 Hook 路径；当前版本不宣称真实 Claude Code 宿主运行 |
| OpenCode | 支持 | 已完成真实生命周期检查，命令列表应出现 `asyoumeant-start` |
| DSH | 实验性适配 | 精确版本 `0.1.1-rc.2`；真实探测受认证阻塞，不能扩展为一般兼容承诺 |

### 已完成的工程证据

- TypeScript 全量编译通过；
- 107 个测试通过；
- `scripts/release-check.mjs` 返回 `status: PASS` 且无失败项；
- `scripts/demo-m2.mjs` 通过；
- Codex C7 真实生命周期通过；
- OpenCode C9 真实生命周期通过；
- DSH 探测停在 `WAITING_USER / DSH_AUTHENTICATION_REQUIRED`，因此 DSH 必须继续标记为实验性和认证门控。

## 3. 产品树

```text
Product：AYM GitHub AI 可检索文档体系
├── Component：README 首屏与标准产品定义
├── Component：README 双语快速开始与支持边界
├── Module：面向 AI 的概览与检索上下文
│   ├── Component：项目概览
│   ├── Component：核心架构
│   └── Component：典型用户请求与响应
├── Module：宿主支持与验证证据
│   ├── Component：Codex
│   ├── Component：Claude Code
│   ├── Component：OpenCode
│   └── Component：DSH
└── Component：文档链接、发布检查和示例验收
```

## 4. 计划新增的文档

第一版只新增四份文档，避免在 README 和多个文档之间复制同一套事实。README 负责首屏定位、选择路径和入口；以下文档负责可深入阅读的细节。

### `docs/overview.md`

提供 AYM 的标准概览：

- 一句话定义；
- 目标用户和典型使用场景；
- `pre-loop`、独立门禁、`major-loop`、`post-loop` 的关系；
- Component—Module—Product 开发树；
- AYM 与普通 Agent 工作流、Skills、Spec-driven development、Guardrails 的区别和联系；
- 产品不保证的内容，例如不把合同验证等同于宿主真实运行保证。

### `docs/host-support.md`

提供以宿主为中心的安装和验证信息：

- Codex、Claude Code、OpenCode、DSH 的安装入口；
- 精确版本要求；
- Hook 或命令入口；
- 已验证证据和验证层级；
- 认证、权限和环境前置条件；
- 已知限制以及用户不应据此推断的兼容范围。

该文档必须与 README 的宿主矩阵保持一致，所有“支持”“已验证”“实验性”等词都要有明确证据来源。

### `docs/examples.md`

提供可复制的用户请求和预期行为：

- 如何请求一次 pre-loop；
- 如何从活文档进入 major-loop；
- 如何使用宿主对应的原生命令；
- 如何观察许可、暂停、恢复、停止和拒绝未授权动作；
- 如何理解验收证据；
- 一个最小的五分钟验证流程。

示例应优先使用真实仓库中已经验证过的命令，不写无法在当前版本复现的理想化对话。

### `docs/ai-context.md`

提供面向 GitHub 搜索、代码检索和 AI coding agent 的标准上下文：

- 项目名称、别名和关键词：`AsYouMeant`、`AYM`、contract-governed coding agent plugin、host plugin、pre-loop、major-loop、Component、Module、Product、Hook、guardrails；
- 用户可能提出的检索问题及对应文档入口；
- 宿主支持和验证状态的规范表达；
- 与普通 workflow、Skills、specification 和权限控制的关系；
- 明确的反向边界，例如 Claude Code 真实宿主运行和 DSH 一般兼容性不能从当前证据推出。

该文档应使用稳定、短句式的定义，方便模型引用和维护者检查，不应堆砌无上下文的关键词。

## 5. README 改造范围

`README.md` 与 `README.zh-CN.md` 应作为同一 Product 同步修改，至少包含以下首屏信息：

1. AYM 的一句话定义；
2. “正在寻找宿主插件的用户”可直接识别的宿主支持矩阵；
3. 每个宿主的安装入口或详细文档链接；
4. 每个宿主的验证状态和限制；
5. 五分钟最小验证路径；
6. `docs/overview.md`、`docs/host-support.md`、`docs/examples.md`、`docs/ai-context.md` 的入口；
7. 面向 AI 检索的稳定项目术语和别名。

现有安装命令、版本号和已确认的验证边界必须继续作为事实来源。任何为提高搜索命中率新增的描述，都必须服从实际实现和验证结果。

## 6. 执行与验收

### 建议执行顺序

1. 先确定 README 首屏的产品定义、宿主矩阵和用户选择路径；
2. 编写四份文档，并将详细内容从 README 连接出去；
3. 同步英文和简体中文 README；
4. 检查所有命令、路径、版本和支持状态是否与仓库现状一致；
5. 执行文档链接、敏感信息和发布检查；
6. 由维护者阅读首屏，确认一个正在找宿主插件的用户无需阅读完整设计章节就能开始下一步。

### 可见验收结果

任务完成时，用户应能在 GitHub 页面上回答：

- 我使用哪个宿主？
- 我需要执行哪条安装命令？
- 如何确认插件已被宿主加载？
- 这个宿主的验证证据是什么？
- 哪些能力仍然是实验性的或需要认证？
- 我应该到哪里了解架构和完整示例？

### 必须保持的边界

- 文档改造不改变运行时代码、Hook 行为、宿主适配逻辑或权限模型；
- README 不得把预构建 Hook 路径验证写成 Claude Code 真实运行保证；
- README 不得把 DSH 的精确版本验证写成 DSH 一般兼容；
- 所有外部发布动作必须在文档内容、链接和检查结果确认后再执行；
- 本文件本身不是 `$major-loop-runner` 或宿主原生命令的启动许可。

## 7. 后续决策点

以下事项在正式实施前需要作为本次新 pre-loop 的明确结果记录：

- README 是否保留完整的专业设计说明，还是将部分内容迁移到 `docs/overview.md`；
- 宿主支持矩阵采用“状态 + 证据 + 限制”三列，还是增加安装难度和认证要求列；
- `docs/ai-context.md` 是否同时提供机器可读的 YAML 或 JSON 片段；
- 是否在四份文档稳定后，再新增 `llms.txt` 或其他面向模型的入口文件；
- GitHub 仓库描述、Topics、Release notes 和 README 是否在同一发布批次更新。

在这些决策完成并通过独立门禁前，不应开始这项文档实现。

## 8. 交接给下一位执行者

下一位执行者应先阅读本文件、`README.md`、`README.zh-CN.md`、`package.json`、`scripts/release-check.mjs` 和各宿主原生目录，然后创建新的候选合同。执行范围应限定为 README 双语同步、四份 `docs/` 文档和必要的文档检查；不得把旧的运行时合同或本交接文档直接当作新任务的启动许可。
