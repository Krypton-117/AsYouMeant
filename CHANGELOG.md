# Changelog / 更新日志

## DSH distribution supplement / DSH 分发补充 - 2026-09-07

- 真实 Web 插件列表验证 AYM 已启用、已挂载；分发验证脚本增加 `--profile web`，区分配置组合检查与浏览器验证，说明 Profile 之间的安装隔离。

- 按 DSH 官方推荐的 GitHub `dsh-plugin` 主题发现机制补齐分发适配，保留现有包名和 Profile Bundle 接口。
- 完善独立 npm 包的仓库元数据、README、LICENSE 和上游许可声明；新增离线 `pack:dsh` 与无需模型认证的 `probe:dsh-package`。
- 验证实际 tarball 解压、五个 Skills、隔离安装、配置组合和卸载。未宣称官方认证或 npm 已发布。
- GitHub topic 搜索确认收录；可下载包作为 v0.3.1 的分发补充，发布页另记源码 commit 与 SHA-256，不移动原 tag。支持范围限于实验性 DSH 0.1.1-rc.2，无专属 Web 配置卡，认证模型执行仍有验证缺口。

## 0.3.1 - 2026-09-07

### 修复与改进

- 普通会话默认不启用 AYM；工作区存在合同不再触发全局 pre-start 锁。
- 新增研究模式：允许宿主批准范围内的只读联网与本地读取，拒绝文件修改、安装、执行、发布、外部消息及其他副作用。
- 正式 AYM 开发仍需显式启用、pre-loop、独立审查和宿主原生启动 permit。切换模式清除旧 permit，会话之间不共享启动权限。
- 拦截提示说明动作、模式、原因、原生启动命令、只读替代路径和退出方式。
- 修复 Codex、Claude Code、OpenCode、DSH 的任务模式接线，移除跨会话 Skill 过滤；更新预构建宿主包。
- 为 OpenCode 生命周期验证请求设置超时，避免宿主无响应时验证无限等待。

### 使用与升级

Codex、Claude Code、DSH：直接发送 `AYM mode research`、`AYM mode aym` 或 `AYM mode ordinary`。OpenCode：使用 `/asyoumeant-mode research`、`/asyoumeant-mode aym` 或 `/asyoumeant-mode ordinary`。

升级后重新安装插件并重启宿主、开启新任务。旧版 permit 不会自动迁移为新会话权限；正式实现前需重新显式启用并启动。详见 [任务模式与 Hook 边界](docs/TASK-MODES.md)。

### 验证边界

Node.js 24.11.1 下 TypeScript 编译、112/112 测试、release check 和 M2 demo 均通过。

Codex 验证包括真实安装/卸载和 Hook 进程；OpenCode 包括真实命令注册和适配器链，宿主曾出现间歇超时。Claude Code 未宣称真实登录运行。DSH 仅针对 `0.1.1-rc.2` 实验性支持，真实模型执行仍受认证阻塞。MPL-2.0 与依赖版本不变。

### English

- Ordinary sessions no longer inherit AYM governance merely because a workspace contract exists.
- Research mode permits recognized read-only tools within host-approved scope and rejects writes, installation, execution, publishing, messages and unknown side effects.
- Explicit AYM development retains independent review and native user start permits. Mode changes invalidate prior permits; authority is isolated by session.
- Denials explain the action, mode, reason, native command, read-only alternative and exit path.
- Updated all four adapters and prebuilt packages; bounded OpenCode verification requests.
- Reinstall and restart the host, then open a new task. Old permits do not automatically migrate. Claude remains contract/Hook-process verified; authenticated DSH execution remains blocked. License and dependency versions are unchanged.
