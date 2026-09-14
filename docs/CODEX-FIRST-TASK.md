# Codex 首次任务：实现与验证边界

状态：2026-09-08 工作区未发布实现。已发布的 0.3.1 插件不含本页新增准备命令；需要从本工作区构建并安装。DSH npm 0.3.1 不变。

## 支持的最小任务

一个用户明确请求的文件修改工作项，使用现有读取与专用文件编辑工具，最后由用户查看结果并验收。依赖安装、测试/服务、外部网络副作用、发布和委派保持禁止。普通任务默认不启用这条流程。

本路线复用 CodexRuntimeContract、Guard、reviewGate、会话模式和原生 permit，不新增并行合同引擎。它不是完整的 Component—Module—Product 自动运行器；验收标准保存在合同中，用户可见验收由对话完成，没有新增持久化自动验收状态。

## 从干净项目开始

先安装本工作区的 Codex 插件，完成宿主要求的 Hook 信任，并在目标项目开启作者会话。宿主必须实际提供 UserPromptSubmit 和 PreToolUse 事件；只看到 Skill 名称不等于 Hook 已生效。

用户输入：

```text
$pre-loop-governor prepare
```

看到 Hook 的 `preparation active` 提示及 `.asyoumeant/draft.json` 后，讨论实际问题。Agent 只编辑这一个草稿，完成如下字段；用户不必手写 JSON：

| 字段 | 消费对象 |
| --- | --- |
| intent.problem / outcome | 独立审查对照用户的实际问题与期望 |
| intent.acceptanceCriteria | 实施后的用户可见验收 |
| candidateVersion | 原生冻结、审查与启动绑定；不是插件版本 |
| activeWorkItemId / actionBasis.requirementIds | 现有 Guard 的工作项与请求依据 |
| policy.allowedPaths | 专用文件工具的允许范围；明确文件或 directory/** |

其余权限保持模板默认。空白目标、缺少验收标准、全局通配符、控制目录或权限扩张均不能冻结。

草稿完成后，由 Agent 给出对应候选的精确命令，用户输入，例如：

```text
$pre-loop-governor freeze candidate=login-v1
```

冻结生成 `.asyoumeant/contract.json` 和 `.asyoumeant/review-request.md`。前者是此候选的冻结权威；原生插件状态保存其内容身份。冻结不等于审查通过，也不创建 permit。

## 独立审查与用户确认

在同一项目开启不同的原生 Codex 会话，输入 `AYM mode research`，让审查者阅读冻结合同及相关代码，针对四个维度分别给出结论和证据：

- intent：是否对应用户确认的目标与验收标准；
- permission：文件范围是否必要，是否有多余权限；
- technical：按当前代码和环境是否可实施；
- internal：目标、文件、候选版本及约束是否一致。

审查者根据实际发现，生成 `review-request.md` 指定的完整原生命令供用户检查。形式为：

```text
$pre-loop-governor review candidate=<冻结版本> projection=<冻结内容标识> findings=<四维审查JSON>
```

findings 的四个键为 intent、permission、technical、internal；每项含布尔 pass 与非空 evidence 字符串。用户在**审查者会话**输入完整命令。缺少维度、作者会话自审、旧内容标识或冻结合同被改写都会拒绝；任一维度失败会拒绝候选。

这是用户对独立审查结果的原生确认记录。程序校验来源会话分离、绑定和记录完整性，不自行调用独立模型，也不能证明审查文字的真实性。不同会话不是不同人的身份证明；本地文件控制权和真实宿主事件可信性仍是系统边界。不能用直接写入 review=passed 代替审查过程。

## 启动、实施与退出

审查通过后回到作者会话，用户输入：

```text
$major-loop-runner start candidate=login-v1
```

以 Hook 的 `permit ACTIVE` 为准。审查者会话不能启动作者任务。Agent 使用专用编辑工具修改允许文件，输出合同里的可见验收步骤，用户明确确认后才能报告接受。

修改目标或范围：作者重新输入 prepare，修订草稿，再冻结和审查。原冻结权威失效，即使旧 permit 仍有时间也不能继续执行。退出：`AYM mode ordinary`，当前会话 permit 清除；重新进入 AYM 不会恢复旧 permit。

## 验证事实

本次源码验证：TypeScript 编译、全量 116/116 测试、release check、M2 demo 通过；随后补充跨作者旧许可回归，新增流程测试 4/4 通过。两份修改后的 Skill 校验通过，涉及文档的 24 个本地链接目标存在。Codex/OpenCode 既有隔离生命周期测试通过；不将其等同于以下新准备路径的真实模型验收。运行时目录未被 Git 跟踪。

基线全量 113 项通过。新增 `test/codex-first-task.test.mjs` 首先复现原生准备入口缺失，再通过真实 Hook 子进程验证：创建未审查草稿、受限编辑、冻结、自审拒绝、四维证据、失配和失败拒绝、审查后仍无 permit、作者精确启动、批准文件放行、越界文件/patch移动/安装/推送/消息拒绝、冻结文件被改写后拒绝、只读研究与退出。测试中的审查结论是标注过的协议测试数据，不是已完成真实独立模型审查的证据。

单独尝试在隔离配置中通过真实 `codex exec` 提交 prepare，25 秒超时，未生成草稿。没有足够输出判断认证、信任或事件投递是哪一层阻塞，未绕过 Hook 信任、沙箱或复制用户凭证。插件卸载与临时目录清理已完成。**因此当前只能报告原生 Hook 进程链验证通过，不能报告真实交互宿主的首次任务端到端已经通过。**

后续宿主验收必须观察：prepare 的真实用户事件产生草稿、独立会话审查记录、作者启动、实际工具拦截和用户验收。若 prepare 没有返回原生确认，应停止并检查宿主插件加载/Hook 信任，不让 Agent 手工创建已审查合同掩盖缺口。
