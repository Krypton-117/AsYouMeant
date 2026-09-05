[English](README.md)

# AsYouMeant 0.2.0

AsYouMeant 是一个以合同约束编程 Agent 的插件。它把“你想要什么”的对话整理成经过审查的开发合同；在你明确开工前锁住实现；并按照你为每个交付节点选择的方式完成验收。

<!-- BEGINNER_GUIDE -->
## 零基础指南

### 它解决什么问题？

编程 Agent 可能误解需求、过早开工、擅自添加功能，或者运行许多测试却没有证明你真正关心的效果。AsYouMeant 在实现前增加一个可见的 pre-loop：

1. 你描述想要的 Product 和希望亲眼看到的结果。
2. Agent 用通俗语言与你确认，并把结论记录到唯一一份活文档。
3. Agent 自行检查技术细节，只把确实需要你决定的冲突交给你。
4. 活文档通过审查且你亲自发送精确 major-loop 启动命令之前，实现始终锁定。
5. 工作按照 Component、可选的多层 Module 和唯一最终 Product 逐级开发、组装与验收。

你不需要阅读源码，不需要懂测试框架，也不必准确记住技术名词。你只需审核实现意图、功能、可见效果、验收选择和外部影响。

### 它适合谁？

- 希望 Agent 解释决定，并给出简短、可见验收步骤的零基础用户。
- 需要意图追溯、执行边界、证据复用和确定性 Guard 裁决的专业开发者。
- 使用 Codex、Claude Code 或 OpenCode 的团队。DSH 仅为绑定一个精确版本的实验支持。

### 支持状态

| 宿主 | 状态 | 已验证证据 |
| --- | --- | --- |
| Codex Windows App `26.825.6671.0` / CLI `0.144.3` | 正式支持 | C7 已完成真实隔离安装、Guard 链路、自检和卸载 |
| Claude Code `2.1.260` | 正式支持 | C8 已完成官方规范对照和自动包合同检查；未在真实 Claude Code 宿主中测试 |
| OpenCode `1.18.18` | 正式支持 | C9 已完成真实隔离安装、原生命令注册、Guard 链路、自检和卸载 |
| DSH `0.1.1-rc.2` | 实验性 | C10 真实隔离生命周期结论为 `VERIFIED_COMPATIBLE`；结论不外推到其他 DSH 版本 |

### 安装前准备

请安装 [Git](https://git-scm.com/)、Node.js `24.11.1`、pnpm `11.19.0`，以及至少一个受支持的编程 Agent 宿主。然后打开终端并运行：

```text
git clone https://github.com/Krypton-117/AsYouMeant.git
cd AsYouMeant
pnpm install --frozen-lockfile
pnpm build
```

只需选择你实际使用的宿主。

#### Codex

在 AsYouMeant 仓库根目录运行：

```text
codex plugin marketplace add .
codex plugin add asyoumeant@asyoumeant
```

#### Claude Code

在 AsYouMeant 仓库根目录运行：

```text
claude plugin marketplace add .
claude plugin install asyoumeant@asyoumeant --scope user
```

本包通过合同验证获得正式支持，但此版本不声称完成过真实 Claude Code 宿主测试。

#### OpenCode

打开你自己的项目；如果以下目录不存在，请先创建：

```text
.opencode/plugins/
.opencode/asyoumeant-runtime/
.opencode/skills/
```

把构建后的 AsYouMeant 文件复制到你的项目：

```text
native/opencode/asyoumeant.js        -> .opencode/plugins/asyoumeant.js
native/opencode/dist/                -> .opencode/asyoumeant-runtime/dist/
native/opencode/skills/*             -> .opencode/skills/
```

从你的项目目录启动 OpenCode；命令列表中应出现 `asyoumeant-start`。

#### DSH（实验性）

仅使用 DSH `0.1.1-rc.2`。把 `<profile>` 替换成你要修改的配置档名称：

```text
dsh plugin --profile <profile> add ./native/dsh
```

真实验证结论仅对这一精确版本为 `VERIFIED_COMPATIBLE`。

### 使用 pre-loop

告诉 Agent 你想开发什么，并要求它使用 AsYouMeant 的 pre-loop。Agent 应当用通俗语言帮助你确认：

- 面向谁，以及最终要看见什么效果；
- 哪些内容在任务内，哪些不在；
- Component—Module—Product 开发树；
- 每个节点由谁执行、由谁验收；
- 测试、失败处理、依赖、外部动作和无人值守安排；
- 哪些证据代表 Product 真正完成。

活文档是唯一权威。由它生成的合同、账本、验收包和任务专用 Skill 都只是投影，不能自行增加权限。实现前，独立只读门禁会检查意图、权限、技术可行性和内部逻辑。审查失败只返回简洁的冲突报告，不会偷偷开工。

### 启动 major-loop

门禁通过后，Agent 会给出精确候选版本。把下表的 `<contract-version>` 替换成该值，并由你亲自输入命令：

| 宿主 | 精确用户命令 |
| --- | --- |
| Codex | `$major-loop-runner start candidate=<contract-version>` |
| Claude Code | `/asyoumeant:major-loop-runner start candidate=<contract-version>` |
| OpenCode | `/asyoumeant-start candidate=<contract-version>` |
| DSH `0.1.1-rc.2` | `/asyoumeant-major-loop-runner start candidate=<contract-version>` |

普通的“继续”、旧候选命令，或者门禁通过前发送的命令，都不得启动实现。

### 成功时你会看见什么？

- 精确启动前，所有实现动作都会被拒绝。
- 精确启动后，只允许执行当前已批准节点。
- 每个 Component 出厂后先验收；每层 Module 及最终 Product 都有各自的验收模式。
- 除非 pre-loop 已明确批准该节点自动验收，否则程序效果和关键链路必须展示给你。
- 动作失败时会给出具体原因和下一步，而不是无限重试。

运行下面的安全本地演示：

```text
pnpm demo:m2
```

输出应显示：pre-start 动作被拒绝，同一个必要动作在有效许可链路中被允许。

### 停止或暂停

直接告诉 Agent“停止”或“暂停”。用户的直接控制优先于活动循环；当前节点必须保存检查点或取消，且不得开始新工作。你也可以使用宿主自带的停止按钮。重新开工仍需有效的已审查合同及其精确启动命令。

### 卸载

Codex：

```text
codex plugin remove asyoumeant@asyoumeant
codex plugin marketplace remove asyoumeant
```

Claude Code：

```text
claude plugin uninstall asyoumeant@asyoumeant --scope user
```

OpenCode：删除 `.opencode/plugins/asyoumeant.js`、`.opencode/asyoumeant-runtime/`，以及 `.opencode/skills/` 下的四个 AsYouMeant 目录：`pre-loop-governor`、`major-loop-runner`、`diagnostic-kernel` 和 `evidence-research`。

DSH：

```text
dsh plugin --profile <profile> remove asyoumeant-dsh
```

<!-- PROFESSIONAL_GUIDE -->
## 专业开发者说明

### 设计

AsYouMeant 只把一份经过审查的活文档视为规范来源。合同编译结果、DAG、账本、Guard 策略、验收包和任务专用 Skill 都是派生投影。投影可以让规范可执行，但不能覆盖规范。

稳定核心刻意只保留合同编译、证据解析、可重放状态、Guard 与许可裁决、major-loop 执行、有界诊断、独立审查、一致性检查和薄宿主适配器。上游框架只贡献精选能力，不会变成强制的普适工作流。本项目不强加通用 TDD、规划、评审、Git、委派和发布循环。

四个稳定 Skill 是：

- `pre-loop-governor`：推断、确认和维护合同，同时保持实现锁定。
- `major-loop-runner`：只有宿主原生启动来源创建有效许可后，才执行当前批准投影。
- `diagnostic-kernel`：针对已有失败，用明确假设和有预算的区分性探针定位问题。
- `evidence-research`：只为具名决定或已批准研究任务收集高可信一手证据。

只有存在可预见、可复用且有具名消费者的循环时，才能现场创建任务专用工作 Skill。它必须绑定当前意图、输入输出、允许动作、资源、完成标准和失效条件；最后一个消费者关闭后即失效。

### Component—Module—Product 模型

Component 是唯一的最小不可分割功能单元，并且总是叶节点。Module 可递归组装 Component 和更低层 Module，也可以完全省略。Product 是唯一根节点和最终产物。`ASSEMBLES` 表示包含，`REQUIRES` 表示执行前置依赖。空 Module、循环或不可达节点均非法。

每个 Component、每级已组装 Module 和 Product 都能独立选择三种模式之一：

1. 有人值守执行、用户验收；
2. 无人值守执行、返回用户验收；
3. 无人值守执行、自动测试并自动验收。

证据绑定节点、标准、实现身份、环境和执行身份。相关变更只会使该节点及其组装祖先失效，因此未变化证据可以复用。

### 合同、门禁与 Guard

pre-loop 门禁是只读的，并与实现职能分离。它针对同一候选检查意图对齐、权限、技术可行性和内部一致性。门禁 PASS 依然不产生执行权限；只有宿主原生的精确启动命令才能创建短期许可。

Guard 检查文件、依赖、测试、重试、网络、委派、外部写入、加固、哈希和权限扩张动作。它保留必要后果，但拒绝范围蔓延、推测性加固、意图违背和任务空转。裁决为 `allow`、`observe` 或 `deny`，同时返回理由代码和允许的下一步。宿主自身的沙箱和安全规则仍然独立生效。

### 宿主适配与证据

| 适配器 | 原生启动接缝 | Guard 接缝 | 证据 |
| --- | --- | --- | --- |
| Codex | `UserPromptSubmit` 与显式 Skill 调用 | 原生 pre-tool hook | C7 真实隔离生命周期 |
| Claude Code | 命名空间 `UserPromptExpansion` | `PreToolUse` | [C8 合同证据](native/claude/CONTRACT-EVIDENCE.json) |
| OpenCode | 注册命令及 `command.execute.before` | `tool.execute.before` | [C9 合同证据](native/opencode/CONTRACT-EVIDENCE.json)及真实隔离生命周期 |
| DSH `0.1.1-rc.2` | 显式调用随包 Skill | `tools/pre-execute` | [C10 真实证据](native/dsh/CONTRACT-EVIDENCE.json) |

Codex、Claude Code 和 OpenCode 构成正式三宿主集合。DSH 是独立 Profile Bundle，不是核心依赖；即使精确版本探针兼容，也必须继续标为实验性。

### 仓库结构

```text
src/contracts/       活文档合同编译
src/evidence/        面向具名决定的一手证据
src/state/           追加式账本与重放
src/guard/           确定性策略与许可检查
src/runner/          节点执行、检查点与控制
src/diagnostics/     有界失败诊断
src/hosts/           薄宿主适配器与生命周期检查
src/conformance/     独立审查与发布投影
native/              可安装宿主包
test/                Component 验收套件
scripts/             验证、演示、探针与发布检查
```

### 开发与验证

冻结工具链为 Node.js `24.11.1`、TypeScript `7.0.2`、ESM、JSON Schema 2020-12、Ajv `8.20.0`、pnpm `11.19.0` 和 `node:test`。Ajv 是唯一核心运行依赖；DSH 和三套上游技能都不是运行依赖。

```text
pnpm install --frozen-lockfile
pnpm build
pnpm verify --node C<n>
pnpm conformance
pnpm demo:m2
pnpm release:check
```

`pnpm verify --node C<n>` 运行指定 Component 的验收套件；`pnpm conformance` 验证组装后的宿主矩阵；`pnpm release:check` 检查发布输入、版本、双语文档、DSH 证据、疑似密钥文本和许可证义务。

### 许可证与上游归属

AsYouMeant 自有源码采用 [MPL-2.0](LICENSE)。MPL-2.0 义务作用于受覆盖文件；项目不会把独立的 MIT 上游材料重新声明为 MPL-2.0。精选或改编自 Superpowers `6.3.0`、Stop That Shit `0.2.0` 和 Matt Pocock Skills manifest `1.2.3` 的内容，在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 中保留归属和 MIT 条款。

