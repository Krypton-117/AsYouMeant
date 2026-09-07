# DSH Web verification

Date: 2026-09-07. Host: local DeepSeek Harness 0.1.1-rc.2 on Windows.
Plugin: asyoumeant-dsh 0.3.1. Archive SHA-256:
`913fbbed6ff1e291c3d1ad2855e1e6c6d87ebfafe0bb3818e89b59053a63fc85`.

## Setup

The verified release archive was installed in a fresh `.work/qa/dsh-web-live-*` DSH_HOME, profile `web`. The environment used the existing isolated host helper, read-only permissions and an absent AYM contract. No daily profile or model credentials were copied. The server bound only to `127.0.0.1`, using port `0` and `--no-open`.

## Observed browser result

After dismissing the developer-preview notice and choosing to configure an API key later, the real browser interface exposed Settings, Plugins, Plugin configuration and Plugin list.

In Plugin list, searching `asyoumeant` produced exactly one result. The accessibility tree reported:

```text
asyoumeant-dsh, 已挂载, 已启用
include:asyoumeant-dsh
配置状态: 已启用
Cordis 状态: 已挂载
```

An actual screenshot confirmed the same labels and the expanded plugin card. This is a manual browser verification through the desktop browser automation tool, not a mocked inventory assertion. The UI described the page as the deployment's installed plugins; it did not present a public marketplace submission flow.

## Reproduction

1. Download the archive from the [0.3.1 release](https://github.com/Krypton-117/AsYouMeant/releases/tag/v0.3.1).
2. Install in the intended profile with `dsh plugin --profile web add ./asyoumeant-dsh-0.3.1.tgz`.
3. Restart that Web profile. Open Settings, Plugins, Plugin list and search for `asyoumeant`.
4. Verify the entry is enabled and mounted. A profile installation is local to that profile; installing only in `headless` does not install it in `web`.

For an isolated installation/composition/removal check, run `node scripts/probe-dsh-package.mjs --dsh-bin <absolute DSH lib/bin.js> --profile web`. This command does not inspect browser UI and explicitly reports that boundary.

## Cleanup and limitations

The temporary Web server exited, the package was uninstalled, and its temporary DSH_HOME was removed. No model request was submitted. This browser run does not verify authenticated execution, a dedicated AYM configuration card, other host versions, or reviewed store admission. npm publication and registry installation in both web and headless profiles were subsequently verified separately; see [distribution status](DSH-DISTRIBUTION.md).
