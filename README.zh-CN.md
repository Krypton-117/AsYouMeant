[English](README.md)

# AsYouMeant 0.3.1

[更新说明 / Release notes](CHANGELOG.md)：按会话显式启用治理，只读研究不再要求 major-loop permit。

**让编程 Agent 实现“你真正想要的”，而不是“它猜出来的”。**

AsYouMeant 是一套以开发合同约束编程 Agent 的插件，面向 Codex、Claude Code 和 OpenCode，并提供实验性的 DSH 适配。它会在写代码前，把你们的对话整理成一份经过审查的活文档；开工后，只允许执行这份文档批准的工作、Skill、验收和交付动作。

<!-- BEGINNER_GUIDE -->

## 1. 直接开始使用

### 它解决什么问题？

编程 Agent 可能过早开工、误解一句普通描述、顺手添加你没要求的“合理功能”，也可能执行很多检查，却没有证明你真正关心的效果。AsYouMeant 把开发分成四个职责清楚的阶段：

1. **pre-loop**：先讨论要做什么，用通俗语言写入活文档；
2. **独立门禁**：检查意图、权限、技术可行性和内部逻辑；
3. **major-loop**：只开发已批准的 Component，并逐级组装为 Product；
4. **post-loop**：在不改动交付物的前提下，有条件地保留 Skill 使用经验。

你决定产品面向谁、有哪些功能、应该看见什么效果、如何验收，以及能否产生外部影响。技术一致性、命令、依赖和准确的冲突报告由 Agent 负责。开始使用前不需要掌握编程术语。

### 它适合你吗？

如果你需要以下能力，AsYouMeant 会比较合适：

- 正式开发前进行充分的需求讨论；
- 用一份易读文档代替分散的计划、账本和临时约定；
- 明确的 Component—Module—Product 开发树；
- 在同一 Product 内为不同部分选择不同验收模式；
- 强制拦截未批准的文件、测试、依赖、重试、委派和发布；
- 根据当前意图选择 Skill，而不是套用固定万能流程。

对于微小、一次性的修改，它会比普通对话更重。它也不能保证 Agent、宿主、测试或需求文档永远没有 Bug；它能做的是让权限、意图、证据和失败都可见、可追溯、有边界。

### 安装

#### 准备环境

请安装：

- [Git](https://git-scm.com/)；
- Node.js `24.11.1`；
- pnpm `11.19.0`；
- 至少一种受支持的编程 Agent 宿主。

先构建一次 AsYouMeant：

```text
git clone https://github.com/Krypton-117/AsYouMeant.git
cd AsYouMeant
pnpm install --frozen-lockfile
pnpm build
```

然后只安装你实际使用的宿主包。

#### Codex

在 AsYouMeant 仓库根目录运行：

```text
codex plugin marketplace add .
codex plugin add asyoumeant@asyoumeant
```

安装或更新插件后，请重启 Codex 并新建任务，确保提示词 Hook 和工具 Hook 已加载。

#### Claude Code

在 AsYouMeant 仓库根目录运行：

```text
claude plugin marketplace add .
claude plugin install asyoumeant@asyoumeant --scope user
```

本仓库已验证 Claude 插件合同和预构建 Hook 路径；本版本不宣称已经在真实 Claude Code 宿主中运行过。

#### OpenCode

请在 AsYouMeant 仓库根目录运行以下命令，并把示例路径替换为你准备用 OpenCode 开发的项目。

PowerShell：

```powershell
$TargetProject = "C:\你的项目路径"
New-Item -ItemType Directory -Force "$TargetProject\.opencode\plugins", "$TargetProject\.opencode\asyoumeant-runtime", "$TargetProject\.opencode\skills"
Copy-Item native/opencode/asyoumeant.js "$TargetProject\.opencode\plugins\asyoumeant.js" -Force
Copy-Item native/opencode/dist "$TargetProject\.opencode\asyoumeant-runtime\dist" -Recurse -Force
Copy-Item native/opencode/skills/* "$TargetProject\.opencode\skills\" -Recurse -Force
```

Bash：

```bash
TARGET_PROJECT="/path/to/your-project"
mkdir -p "$TARGET_PROJECT/.opencode/plugins" "$TARGET_PROJECT/.opencode/asyoumeant-runtime" "$TARGET_PROJECT/.opencode/skills"
cp native/opencode/asyoumeant.js "$TARGET_PROJECT/.opencode/plugins/asyoumeant.js"
cp -R native/opencode/dist "$TARGET_PROJECT/.opencode/asyoumeant-runtime/"
cp -R native/opencode/skills/* "$TARGET_PROJECT/.opencode/skills/"
```

从目标项目启动 OpenCode，命令列表中应出现 `asyoumeant-start`。

#### DSH（实验性）

当前只面向精确版本 `0.1.1-rc.2`。请将 `<profile>` 替换为你使用的配置档名称：

```text
dsh plugin --profile <profile> add ./native/dsh
```

DSH 是尽力提供的实验适配，不代表一般性兼容保证。

DSH 官方推荐通过 GitHub [`dsh-plugin` 主题](https://github.com/topics/dsh-plugin) 发现社区插件。AYM 独立 Profile Bundle 已发布为 [asyoumeant-dsh@0.3.1](https://www.npmjs.com/package/asyoumeant-dsh/v/0.3.1)，并在 DSH 0.1.1-rc.2 完成真实 registry 安装验证；这不代表官方认证。详见 [DSH 分发与发现](docs/DSH-DISTRIBUTION.md)。

```text
dsh plugin --profile web add asyoumeant-dsh@0.3.1
```

已在 DSH 0.1.1-rc.2 的真实 Web“设置 → 插件 → 插件列表”中验证 AYM 已启用、已挂载。使用该界面需安装到 `web` Profile；只安装到 `headless` 不会自动出现在 Web Profile 中。详见 [Web 验证记录](docs/DSH-WEB-VERIFICATION.md)。

从仓库构建可移植安装包：

```text
pnpm pack:dsh
dsh plugin --profile <profile> add ./.work/packages/asyoumeant-dsh-0.3.1.tgz
```

DSH 的 `VERIFIED_COMPATIBLE` 结论只适用于精确的 `0.1.1-rc.2` 宿主版本和已经测试的合同边界。

#### 验证本地构建

在仓库根目录运行：

```text
pnpm build
pnpm demo:m2
```

`demo:m2` 会演示可见许可、暂停、恢复和停止路径，不会修改 Product。

`0.2.0 → 0.3.0` 迁移增加了可选的 Skill pool 投影、task-local Skill 处理、条件式 test-first 证据和建议性的 post-loop 经验存储。没有新投影时，既有 0.2 合同仍可读取。

### 开始第一个 pre-loop

安装 AYM 或工作区存在 `.asyoumeant/contract.json`，不会让新会话自动启用治理。普通任务使用宿主原有权限，写入和外部副作用仍遵循宿主审批规则，不需要 AYM permit。

| 模式 | 行为 |
| --- | --- |
| 普通（默认） | 不启用 AYM 门禁；读取、联网研究和普通开发由宿主权限控制。 |
| 研究 | 只允许宿主批准范围内已识别的只读工具；禁止修改文件、安装、测试或服务、发布、发消息和其他副作用；不需要 major-loop permit。 |
| AYM | 用户显式启用后，经过 pre-loop、独立审查和宿主原生启动命令，才允许实现。 |

Codex、Claude Code、DSH 中直接发送 `AYM mode research`、`AYM mode aym` 或 `AYM mode ordinary`；OpenCode 使用 `/asyoumeant-mode research`、`/asyoumeant-mode aym` 或 `/asyoumeant-mode ordinary`。切换会使旧 permit 失效。模式在当前会话中保持，新会话默认普通模式；文档里的 AYM 字样和普通代码请求不构成启用。

下面的明确 pre-loop 请求可在支持直接用户提示 Hook 的路径启用 AYM；OpenCode 的确定入口是模式命令。只有歧义会改变权限时才询问最小必要问题。工具识别、状态迁移和宿主验证边界见[任务模式与 Hook 边界](docs/TASK-MODES.md)。

把下面这段话发送给编程 Agent，并替换方括号内容：

```text
请使用 AsYouMeant 为以下目标准备 pre-loop：[描述你想做什么]。
现在不要实现。请用零基础用户能理解的语言逐项确认，并只维护一份活文档作为唯一权威。
```

Agent 应当帮助你确认：

- Product 面向谁，要解决什么问题；
- 完成后应该看见什么效果；
- 哪些内容属于任务，哪些明确不做；
- Component—Module—Product 开发树；
- 每个节点如何执行、由谁验收；
- 无人值守、测试、权限、失败处理和交付方式；
- 什么证据足以说明每个节点已经完成。

你不必准确记住技术名词。Agent 应根据上下文识别最可能的意图，并用日常语言解释；只有两种理解会实质改变结果或权限时，才向你询问最小必要问题。

### 正式启动 major-loop

活文档通过独立门禁前，任何实现都保持锁定。门禁通过后，Agent 会给出精确候选版本。请由你亲自输入对应宿主的原生命令：

| 宿主 | 精确命令 |
| --- | --- |
| Codex | `$major-loop-runner start candidate=<contract-version>` |
| Claude Code | `/asyoumeant:major-loop-runner start candidate=<contract-version>` |
| OpenCode | `/asyoumeant-start candidate=<contract-version>` |
| DSH `0.1.1-rc.2` | `/asyoumeant-major-loop-runner start candidate=<contract-version>` |

请将 `<contract-version>` 替换为已审查活文档里的值。普通的“继续”、过期版本、门禁前发送的命令，或由 Agent 自己生成的命令，都不能授权实现。

### 你会看到怎样的交付过程？

工作按照从小到大的顺序交付：

```text
Component → 可选的多层 Module → Product
```

Component 是最小、不可再分的功能单元；Module 可以组装 Component 或更低层 Module；Product 是唯一最终产物。每个 Component、每一级 Module 和 Product 都能单独选择验收方式，因此同一任务可以同时包含：

- 有人值守执行，并由用户验收；
- 无人值守执行，随后由用户验收；
- 无人值守执行，并自动检查、自动验收。

需要人判断时，Agent 会给出短而具体的可见操作，让你亲眼确认结果。pre-loop 已明确允许自动验收时，Agent 按约定规则判断，不要求你阅读技术日志。

### 停止、变更与卸载

你随时可以停止或收窄任务。凡是会改变意图、权限、成本或外部影响的变更，都必须返回 pre-loop，并使旧启动许可失效。

卸载 Codex 版本：

```text
codex plugin remove asyoumeant@asyoumeant
codex plugin marketplace remove asyoumeant
```

卸载 Claude Code 版本：

```text
claude plugin uninstall asyoumeant@asyoumeant --scope user
```

OpenCode 用户需删除 `.opencode/plugins/asyoumeant.js`、`.opencode/asyoumeant-runtime/`，以及 `.opencode/skills/` 下五个 AsYouMeant Skill 目录。

卸载 DSH 版本：

```text
dsh plugin --profile <profile> remove asyoumeant-dsh
```

<!-- PROFESSIONAL_GUIDE -->

## 2. 为什么要这样设计？

### 三个核心问题：对象、问题、意图

AsYouMeant 从三个问题开始：

- **对象**：谁或什么会真正消费这个结果？
- **问题**：哪一种可观察的困难必须被改变？
- **意图**：用户真正要的结果和授权边界是什么？

没有消费对象的功能值得怀疑；没有具名问题的流程至多是可选项；即使技术上完全正确，只要违背预期结果，交付仍然是错的。

因此，系统中心不是一套万能流程，而是唯一活文档。

### 从 Superpowers 出发，再把完整框架拆开

[Superpowers](https://github.com/obra/superpowers) 展示了很多有价值的思想：先询问再编码、把讨论整理成规范、规划实现、使用真实反馈循环并审查结果。它同时把自己定位成完整的软件开发方法论，由 Skill 自动推动规划、TDD、子 Agent、评审和收尾等广泛流程。

当任务正好适合这套流程时，完整性是一种优势；当每个任务都必须继承没有消费对象的步骤时，完整性就可能变成额外成本，甚至造成意图偏离。

真实研究结论比“OpenAI 论文证明 Superpowers 效费比低”更复杂。[SkillsBench](https://arxiv.org/abs/2602.12670) 不是 OpenAI 发布的论文，也没有直接评测 Superpowers。它发现精选 Skill 整体上明显提高成功率，但最多包含三个模块的聚焦 Skill 集合优于更大、更穷尽的组合。之后的 [Microsoft Research 研究](https://www.microsoft.com/en-us/research/publication/agent-skills-can-be-harmful-an-empirical-study-of-skill-induced-failures-in-llm-agents/) 则把一部分功能失败和效率退化归因到看似相关的 Skill，其中过度验证和沉重实现流水线是最主要的程序性原因之一。

因此 AsYouMeant 没有否定 Superpowers，而是将它拆解。澄清、规划、test-first、调试、评审和验证仍然是可选能力，但不再自动成为所有任务的义务。是否使用，取决于当前合同里有没有真实消费者。

### 为什么吸收 Stop That Shit 的刹车？

“不要过度设计”只是一句建议。Agent 仍可能为又一次测试、校验和、兼容层、子 Agent 或“顺手发布”找到理由。

[Stop That Shit](https://github.com/lennney/stop-that-shit) 展示了如何把明确边界变成可执行 Hook 和 Guard。AsYouMeant 吸收了其中的职责分离：

- 活文档决定**什么被授权**；
- Skill 在边界内帮助 Agent 决定**怎么做**；
- Guard 在动作越过已审查权限时强制回答**不允许**。

Guard 不替用户决定产品意图。它负责拦截合同外文件、未批准依赖、没有消费对象的测试、重复诊断、超预算委派、臆想式加固、哈希、网络操作和外部发布。宿主自己的安全与沙箱规则仍然独立生效。

### Matt Pocock 教会了我们什么？

[Matt Pocock 的 Skills 集合](https://github.com/mattpocock/skills) 主张使用小型、可调整、可组合的 Skill，而不是让框架接管整个开发过程。AsYouMeant 接受了这点，并进一步要求每个 Skill 明确自己的消费对象。

Skill 不是抽象意义上的“好工具”。它只可能适合某一种意图、动作边界、输入、输出、资源和完成标准。Agent 先从已有环境寻找合适 Skill；找不到时，只有在具名的技术栈故障、上下文溢出恢复，或可预见的可复用循环中，才能生成高度定制的 task-local Skill。最后一个消费者消失后，Skill 只退出活动池，不被删除。

最终形成的是动态 Skill 池，而不是永久加载的指令堆。

### 项目如何演进？

- **0.1** 建立合同权威、可重放状态、Guard 裁决、有预算诊断和 Component—Module—Product 模型。
- **0.2** 加入宿主原生包、独立门禁、显式启动许可、验收呈现和交付边界。
- **0.3** 加入动态 Skill 池、按意图定制的 task-local Skill、双轴审查、条件式 test-first 证据，以及独立、无权的 post-loop。

演进顺序很明确：先定义权威，再让多宿主强制遵守，最后让可复用能力按任务动态出现和退出。

### 它的创新边界在哪里？

AsYouMeant 不宣称发明了规范、门禁、DAG、Hook、验收树、Skill 生成或复盘。公开领域已有许多相邻工作，例如：

- [Spec Kit](https://github.com/github/spec-kit) 的规范驱动开发；
- [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) 的自适应、分阶段 AI 开发；
- [MUSE-Autoskill](https://arxiv.org/abs/2605.27366) 的跨任务 Skill 创建、检索、评价和改进。

在本项目限定范围内检查到的公开资料中，我们没有发现与 AsYouMeant 完全同构的实现。更严谨的创新表述是：**AsYouMeant 是一种原创的方法论整合与工程实践，把单一意图活文档、独立审查的授权边界、递归逐节点验收，以及绑定消费对象的动态 Skill 生命周期组合成一个系统。**

这是对组合方式和工程实现的主张，不是“世界首创”、绝对正确或占有底层思想的主张。

## 3. 专业技术说明

### 总体架构

```text
对话
  ↓
唯一活文档
  ↓ 编译投影
合同 · 节点图 · 验收 · Guard · Skill 池
  ↓
独立只读门禁
  ↓ 用户原生精确启动
major-loop：Component → Module → Product
  ↓
可选的无权 post-loop
```

TypeScript 核心保持宿主中立。每个宿主包只负责把自己的提示词、命令、Skill 和工具事件转换为统一合同与 Guard 模型。适配器刻意保持轻薄，避免宿主差异污染 Product 逻辑。

### 一个权威，多种投影

经过审查的活文档是规范权威。运行时 JSON、节点卡、账本、验收包、Guard 策略和 task-local Skill 都是投影。投影可以让决定变得可执行，但无权增加活文档没有批准的文件、测试、依赖、权限、委派、交付动作或完成标准。

Agent 负责投影的技术正确性，用户负责预期行为和外部后果。

### 递归 Product 图

图中只能存在一个 Product 根节点。Component 必须是叶节点；Module 可递归组装 Component 和更低层 Module，也可以完全省略。

- `ASSEMBLES` 表示组成关系；
- `REQUIRES` 表示执行前置依赖；
- 循环、空 Module、重复实现、不可达节点和多个 Product 根均为非法；
- 只有依赖、输入、权限与资源均就绪的节点才能运行；
- 相关变更只使该节点及其组装祖先失效，不推翻无关的已验收工作。

简单任务可以保持扁平，复杂任务则能按真实需要继续嵌套。

### 门禁、permit 与 Guard

独立门禁只读检查同一个冻结候选的四个维度：

1. 意图可追溯；
2. 权限不扩张；
3. 技术可执行；
4. 内部逻辑自洽。

门禁通过本身不等于开工。宿主中的用户原生动作还必须创建绑定候选、绑定投影且具有有效期的 permit。此后 Guard 才会按照活动工作项和合同策略判断敏感动作。

在宿主能够提供所需事件时，Guard 给出确定性结果：

- `allow`：动作已映射且位于授权边界内；
- `observe`：边界无法确定，或宿主不能完整强制；
- `deny`：动作与已知边界冲突，不能执行。

Hook 只能覆盖宿主暴露的事件路径。AsYouMeant 不会把缺失 Hook 描述成成功拦截。

### 验收属于合同本身

每个 Component、每一级 Module 和 Product 都独立指定验收。执行与验收都可以有人或无人值守，自动检查也由节点单独决定。

系统可能给出的结果代表：

| 结果 | 含义 |
| --- | --- |
| 自动通过 | 具名判定规则接受了绑定当前节点和实现身份的证据。 |
| 用户可见验收 | 用户按简短操作看见实际效果并明确接受。 |
| 静态免测批准 | 静态或继承证据已经充分；不得把它表述为“测试通过”。 |
| 冲突停止 | 系统在改变意图、扩大权限或消费无依据假设之前停止。 |
| 聚合关闭 | 直接子节点全部通过，因此 Module 或 Product 无需重复测试即可关闭。 |
| 证据不足 | 节点保持未完成；不确定性不会被偷偷改写成成功。 |

仓库可以保存具体证据，但 README 只解释结果语义，不充当发布审计日志。

### 动态 Skill 生命周期

稳定核心只预置五个窄 Skill：

| Skill | 消费对象 |
| --- | --- |
| `pre-loop-governor` | 意图讨论与合同准备 |
| `major-loop-runner` | 执行已授权的当前投影 |
| `diagnostic-kernel` | 针对已有失败执行一次有证据、有区分力的探测 |
| `evidence-research` | 为一个合同消费者解决一个具名技术疑点 |
| `post-loop-curator` | Product 关闭后，根据证据评价已使用 Skill |

逻辑池遵循以下生命周期：

```text
寻找已有 Skill
    ↓ 是否匹配？
入池 ── 服务具名消费者
    ↓ 最后一个消费者关闭
出池，但保留文件
    ↓ 未来再次出现消费者
重新评估后才能入池
```

task-local Skill 是兜底方案，不是默认动作。生成物必须绑定触发条件、合同指针、消费者、允许动作、资源、输入、输出、完成标准和失效条件。共享的 `~/.asyoumeant/skill-experience.md` 记录有证据支持的适用性和改进建议，但没有执行、入池、许可或验收权。

### 四宿主适配

| 宿主 | 原生集成方式 | 边界 |
| --- | --- | --- |
| Codex | 插件 Skill、`UserPromptSubmit` 启动识别和 `PreToolUse` Guard | 安装后需重启或新建任务，让 Hook 生效 |
| Claude Code | 命名空间 Skill 展开与 `PreToolUse` Hook | 使用其文档化插件和 Skill 控制 |
| OpenCode `1.18.18` | command transform、Skill transform/reload、permission Hook 和工具 Guard | 安装到目标项目 |
| DSH `0.1.1-rc.2` | Profile Bundle、显式启动 Skill 和 provider 过滤 | 实验性、精确版本、尽力支持 |

所有宿主都必须维持逻辑隔离；只有宿主明确支持且安全时，才物理隐藏已经出池的 Skill。

### 仓库结构

```text
src/contracts/       合同类型、Schema 与编译
src/evidence/        面向具名决策的证据解析
src/state/           追加式状态与重放
src/guard/           确定性策略与 permit 检查
src/runner/          节点执行与检查点
src/diagnostics/     有预算的失败诊断
src/skills/          动态池与 task-local Skill 编译
src/post-loop/       无权经验整理
src/hosts/           轻量宿主适配器
src/conformance/     独立审查与结果呈现
native/              可安装宿主包
test/                面向节点的检查
scripts/             构建、验证、探测与发布工具
```

冻结开发栈为 Node.js `24.11.1`、TypeScript `7.0.2`、ESM、JSON Schema 2020-12、Ajv `8.20.0`、pnpm `11.19.0` 和 `node:test`。Ajv 是唯一核心运行依赖；宿主 SDK 和三个上游 Skill 集合都不是核心运行依赖。

### 兼容与扩展

0.3 的 `skillPool` 投影是可选字段，因此既有 0.2 合同仍可读取。宿主适配器可以提供更强的物理隔离，但必须保持同一逻辑合同，也不能削弱宿主自身安全机制。

只有同时具备以下条件时，扩展才应进入系统：

- 有具名消费对象和真实问题；
- 能追溯到已确认意图；
- 明确动作、输入、输出、资源和完成标准；
- 定义失效与失败路线；
- 系统中不存在重复的能力所有者。

潜在改进只能先成为提案；必须有一手资料研究支持，并得到用户直接许可，才能实装。

### 许可证

AsYouMeant 自有源码采用 [MPL-2.0](LICENSE)。来自 Superpowers、Stop That Shit 和 Matt Pocock Skills 的精选或改编内容，在 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 中保留 MIT 归属和许可。AsYouMeant 不会把独立的 MIT 上游内容重新标记为 MPL-2.0。

## 来源与致谢

项目与方法论来源：

- [Superpowers](https://github.com/obra/superpowers)
- [Stop That Shit](https://github.com/lennney/stop-that-shit)
- [Matt Pocock Skills](https://github.com/mattpocock/skills)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD)

研究资料：

- [SkillsBench：跨任务评测 Agent Skills](https://arxiv.org/abs/2602.12670)
- [Agent Skills Can Be Harmful：Skill 导致的 Agent 失败实证研究](https://www.microsoft.com/en-us/research/publication/agent-skills-can-be-harmful-an-empirical-study-of-skill-induced-failures-in-llm-agents/)
- [MUSE-Autoskill：基于创建、记忆、管理与评价的自演进 Agent](https://arxiv.org/abs/2605.27366)

宿主文档：

- [Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [OpenCode Skills](https://opencode.ai/v2/docs/skills) 与 [插件文档](https://opencode.ai/v2/docs/build/plugins/)
- [DSH Skills 子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)
