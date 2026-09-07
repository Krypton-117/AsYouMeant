# AsYouMeant for DSH

AsYouMeant (AYM) adds explicit, contract-governed development to DeepSeek Harness. This package is a native DSH Profile Bundle: `dsh.bundle.patch` installs the bundled Cordis plugin, which provides five Skills and task-scoped tool admission.

## Install from npm

```text
dsh plugin --profile <profile> add asyoumeant-dsh@0.3.1
```

## Install a local package

From the AsYouMeant repository root, replace `<profile>` with the profile you use:

```text
dsh plugin --profile <profile> add ./native/dsh
```

The bundle supports DSH `0.1.1-rc.2` experimentally. Restart the DSH profile after installation. DSH officially recommends the GitHub `dsh-plugin` repository topic for plugin discovery; package compatibility does not imply official listing or endorsement.

## Portable package

From the repository root:

```text
node scripts/pack-dsh.mjs
dsh plugin --profile <profile> add ./.work/packages/asyoumeant-dsh-0.3.1.tgz
```

`asyoumeant-dsh` is the registry package name. Do not install the whole GitHub repository as an npm plugin: its root package is the development workspace, not this Profile Bundle.

## Task modes

New sessions default to ordinary mode, governed by the host's permissions. A workspace contract alone does not enable AYM.

- `AYM mode research`: permit recognized read-only tools; reject writes and external effects.
- `AYM mode aym`: enter AYM governance and prepare the pre-loop contract.
- `AYM mode ordinary`: leave AYM governance and invalidate its permit.

After independent review passes, enter the native start command yourself:

```text
/asyoumeant-major-loop-runner start candidate=<reviewed-version>
```

The permit requires both the direct user command and the native injected Skill event. Scope, version, expiry and allowed tools are checked before governed execution. Restarting the agent loses the in-memory permit.

## Uninstall

```text
dsh plugin --profile <profile> remove asyoumeant-dsh
```

## Boundaries

The package has no runtime npm dependencies and no installation scripts. It includes its JavaScript entry, profile patch, five Skills and license notices. Model execution requires the host's own authentication and permissions. Historical `CONTRACT-EVIDENCE.json` describes the 0.3.0 experiment, not a new authenticated run; subsequent authenticated checks remain blocked by missing credentials.

DSH's Web Plugin list is an inventory of the loaded host composition, not a public package store. This package has no dedicated Web settings card; Web visibility and authenticated model execution are not covered by the tarball installation test. Support remains experimental and limited to the exact host version above.

## License

AYM-owned source uses MPL-2.0; adapted upstream material retains the MIT notices in `THIRD_PARTY_NOTICES.md`. Both documents are included in the installed package.
