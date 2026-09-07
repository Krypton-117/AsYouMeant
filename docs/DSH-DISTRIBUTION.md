# DSH 分发与发现

## 官方入口

DSH 官方 README 建议社区插件仓库添加 GitHub `dsh-plugin` topic，供用户在 [插件主题页](https://github.com/topics/dsh-plugin) 发现。AYM 使用这一发现机制，保留 npm 包名 `asyoumeant-dsh` 和现有 Profile Bundle 接口；没有新增未经官方定义的 marketplace manifest。

topic 不代表官方认证或审核上架；npm 发布已另行验证，见下文。已核实的一手来源及范围见[研究记录](DSH-MARKETPLACE-RESEARCH.md)。当前兼容边界仍为 DSH `0.1.1-rc.2`，不把上游最新源码文档当作新版本兼容证据。

## 打包与安装

已发布的 [npm 包](https://www.npmjs.com/package/asyoumeant-dsh/v/0.3.1) 可直接安装，无需克隆或本地打包：

```text
dsh plugin --profile web add asyoumeant-dsh@0.3.1
```

命令行任务可将 `web` 改为 `headless`。安装后重启对应 Profile。

仓库根目录执行：

```text
pnpm pack:dsh
```

也可直接执行 `node scripts/pack-dsh.mjs`。需要 Node.js 自带的 npm；打包关闭安装脚本并使用离线模式，不下载依赖。产物为 `.work/packages/asyoumeant-dsh-0.3.1.tgz`，包含入口 JavaScript、Cordis patch、五个 Skills、README、完整 MPL-2.0 文本和上游许可声明。

```text
dsh plugin --profile <profile> add ./.work/packages/asyoumeant-dsh-0.3.1.tgz
```

也可以继续使用本地目录 `dsh plugin --profile <profile> add ./native/dsh`。安装后重启该 Profile。卸载命令为 `dsh plugin --profile <profile> remove asyoumeant-dsh`。

不要直接把 GitHub 仓库根目录当作 npm 插件安装：根目录是开发工程，真正的 `dsh.bundle.patch` 位于 `native/dsh/package.json`。分发 tarball 可以避免 npm 的 Git URL 无法直接选择这个子目录的问题。

## GitHub 下载与支持范围

DSH 安装包作为 [v0.3.1 发布页](https://github.com/Krypton-117/AsYouMeant/releases/tag/v0.3.1) 的分发补充提供，资产名为 `asyoumeant-dsh-0.3.1.tgz`。下载后执行：

```text
dsh plugin --profile <profile> add ./asyoumeant-dsh-0.3.1.tgz
```

发布页记录补充分发包的源码 commit 和 SHA-256；原 `v0.3.1` tag 不移动。补充包改善打包元数据、许可文件和说明，插件运行入口仍为 0.3.1。

| 项目 | 验证状态 |
| --- | --- |
| GitHub 官方推荐 topic 发现 | GitHub 搜索索引已返回 AYM |
| Profile Bundle 格式与可移植包 | 已验证，包含入口、patch、五个 Skills 和许可 |
| DSH 0.1.1-rc.2 安装、组合、卸载 | 真实隔离宿主通过 |
| 模式、审查和 permit 逻辑 | 自动化测试通过；认证模型端到端仍未通过 |
| npm registry 安装 | 已公开发布 0.3.1；web、headless 真实安装、逐文件比对、组合与卸载均通过 |
| Web Plugin list 中显示 AYM | 0.1.1-rc.2 真实 Web 界面已验证：搜索得到一个 AYM 结果，状态为已启用、已挂载 |
| AYM 专属 Web 配置卡 | 未提供；需要额外的浏览器插件与设置 namespace |
| 其他 DSH 版本 | 未验证，不宣称兼容 |

因此当前应称为“实验性 DSH Profile Bundle 支持”，不能称为完整 Web 集成、官方商店审核上架或全版本支持。官方 Web 页面与索引核对的来源见[研究记录](DSH-MARKETPLACE-RESEARCH.md)。

## npm 发布边界

维护者完成 2FA 发布后，公开 registry 已返回 `asyoumeant-dsh@0.3.1`。独立下载的 npm tarball SHA-256 为 `913fbbed6ff1e291c3d1ad2855e1e6c6d87ebfafe0bb3818e89b59053a63fc85`，与 GitHub 发布资产一致，共 12 个文件。真实 DSH 的 `web` 与 `headless` 隔离 Profile 均通过 registry 安装、逐文件源码比对、配置组合和卸载；未使用日常 Profile 或模型凭证。

已发布版本不可覆盖；后续改变运行行为需按仓库版本流程更新版本和验证记录。GitHub topic 负责发现，npm 负责包分发，两者都不等于官方商店审核。

## 验证

```text
pnpm build
node --test dist/test/c10-dsh-experimental-probe.test.js test/dsh-package.test.mjs
node scripts/probe-dsh-package.mjs --dsh-bin <absolute-path-to-DSH-lib/bin.js>
node scripts/probe-dsh-package.mjs --dsh-bin <absolute-path-to-DSH-lib/bin.js> --profile web
```

增加 `--registry` 可重复验证真实 registry 安装；探测会逐个比对安装文件与源码，然后检查组合与卸载。两个 Profile 的这一验证均已通过。

### Web 插件列表验证

已在独立 DSH_HOME 的 `web` Profile 安装 0.3.1 tarball，并以 `dsh web --host 127.0.0.1 --port 0 --no-open` 启动真实 Web 宿主。跳过 API Key 配置后，进入“设置 → 插件 → 插件列表”，搜索 `asyoumeant`，结果数量为 1。展开 `asyoumeant-dsh` 后，条目 ID 为 `include:asyoumeant-dsh`，配置状态为“已启用”，Cordis 状态为“已挂载”。界面文字与截图均已检查；验证结束后停止服务、卸载并清理临时 Profile。

这证明安装后的 AYM 可在该版本的插件列表中发现并加载，不证明公开商店审核或 npm 发布。上述 `--profile web` 脚本只重复验证安装、文件、组合和卸载，输出 `webUi: not-requested`，不冒充浏览器测试。界面证据见[Web 验证记录](DSH-WEB-VERIFICATION.md)。

`dsh-package.test.mjs` 使用系统 `tar` 解压真正的 npm 包，检查内容白名单、加载模块并读取全部 Skills。`probe-dsh-package.mjs` 在 `.work/qa/` 内创建独立 DSH_HOME，验证精确宿主版本、从 tarball 安装、Bundle 自动登记、组合配置、卸载和清理；每个宿主命令最多运行 60 秒，不改变日常 Profile。

本次 `0.1.1-rc.2` tarball 安装、配置组合和卸载已通过。此流程不调用模型，不需要模型凭证，不应被报告为认证后的模型执行通过。真实治理行为的认证探测仍由 `scripts/probe-dsh.mjs` 单独负责，旧版 `CONTRACT-EVIDENCE.json` 保持历史含义。

2026-09-07 验证结果：TypeScript 编译通过、全量测试 113/113 通过、release check 和本地文档链接检查通过。GitHub API 已确认 `Krypton-117/AsYouMeant` 包含 `dsh-plugin` topic，添加时保留了全部原有 topic；后续搜索也确认了索引收录。npm 发布及两个 Profile 的 registry 安装已随后验证，已有版本 tag 不变。
