# DSH 分发与发现

## 官方入口

DSH 官方 README 建议社区插件仓库添加 GitHub `dsh-plugin` topic，供用户在 [插件主题页](https://github.com/topics/dsh-plugin) 发现。AYM 使用这一发现机制，保留 npm 包名 `asyoumeant-dsh` 和现有 Profile Bundle 接口；没有新增未经官方定义的 marketplace manifest。

这不是官方认证、审核上架或 npm 发布记录。已核实的一手来源及范围见[研究记录](DSH-MARKETPLACE-RESEARCH.md)。当前兼容边界仍为 DSH `0.1.1-rc.2`，不把上游最新源码文档当作新版本兼容证据。

## 打包与安装

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
| npm registry 安装 | 尚未发布；登录已确认，发布被 npm 的 2FA 要求拒绝（E403） |
| Web Plugin list 中显示 AYM | 官方定义为宿主插件清单；尚未实测 AYM 可见性 |
| AYM 专属 Web 配置卡 | 未提供；需要额外的浏览器插件与设置 namespace |
| 其他 DSH 版本 | 未验证，不宣称兼容 |

因此当前应称为“实验性 DSH Profile Bundle 支持”，不能称为完整 Web 集成、官方商店审核上架或全版本支持。官方 Web 页面与索引核对的来源见[研究记录](DSH-MARKETPLACE-RESEARCH.md)。

## npm 发布边界

包已包含公开分发元数据、仓库子目录定位和必要许可文件，但本次发布尝试被 npm 的 2FA 要求拒绝（E403）；登录成功不等于已具备发布认证。维护者需完成 npm 双因素认证要求。发布前检查同名同版本是否已存在，并发布验证过的压缩包：`npm publish <verified-tarball-path> --access public --ignore-scripts --registry=https://registry.npmjs.org`。已发布版本不可覆盖；后续改变运行行为需按仓库版本流程更新版本和验证记录。

发布成功后，用户才可通过 `dsh plugin --profile <profile> add asyoumeant-dsh@<published-version>` 使用 registry 安装。GitHub topic 只解决发现，不托管 npm 包，也不意味着上述命令当前已可从 registry 安装。

## 验证

```text
pnpm build
node --test dist/test/c10-dsh-experimental-probe.test.js test/dsh-package.test.mjs
node scripts/probe-dsh-package.mjs --dsh-bin <absolute-path-to-DSH-lib/bin.js>
```

npm 发布成功后，增加 `--registry` 验证真实 registry 安装；探测会逐个比对安装文件与源码，然后检查组合与卸载。

`dsh-package.test.mjs` 使用系统 `tar` 解压真正的 npm 包，检查内容白名单、加载模块并读取全部 Skills。`probe-dsh-package.mjs` 在 `.work/qa/` 内创建独立 DSH_HOME，验证精确宿主版本、从 tarball 安装、Bundle 自动登记、组合配置、卸载和清理；每个宿主命令最多运行 60 秒，不改变日常 Profile。

本次 `0.1.1-rc.2` tarball 安装、配置组合和卸载已通过。此流程不调用模型，不需要模型凭证，不应被报告为认证后的模型执行通过。真实治理行为的认证探测仍由 `scripts/probe-dsh.mjs` 单独负责，旧版 `CONTRACT-EVIDENCE.json` 保持历史含义。

2026-09-07 验证结果：TypeScript 编译通过、全量测试 113/113 通过、release check 和本地文档链接检查通过。GitHub API 已确认 `Krypton-117/AsYouMeant` 包含 `dsh-plugin` topic，添加时保留了全部原有 topic；后续搜索也确认了索引收录。分发补充不改变已有版本 tag，不宣称 npm 已发布。
