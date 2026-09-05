[简体中文](README.zh-CN.md)

# AsYouMeant 0.2.0

AsYouMeant is a contract-governed plugin for coding agents. It turns a conversation about what you want into a reviewed development contract, keeps implementation locked until you explicitly start it, and verifies each deliverable at the level you chose.

<!-- BEGINNER_GUIDE -->
## Beginner guide

### What problem does it solve?

Coding agents can misunderstand a request, start too early, add work you did not ask for, or run many tests without proving the result you care about. AsYouMeant puts a visible pre-loop before implementation:

1. You describe the product and the result you want to see.
2. The agent asks plain-language questions and records one living specification.
3. The agent checks the technical details and reports only conflicts that require your decision.
4. Implementation remains locked until the specification passes review and you send the exact major-loop start command.
5. The work is built and accepted as Components, optional nested Modules, and one final Product.

You do not need to read source code, understand test frameworks, or remember exact technical names. You review intent, features, visible behavior, acceptance choices, and external effects.

### Who is it for?

- Beginners who want an agent to explain decisions and provide short, visible acceptance steps.
- Professional developers who want traceable intent, bounded execution, reusable evidence, and deterministic Guard decisions.
- Teams using Codex, Claude Code, or OpenCode. DSH support is experimental and pinned to one exact version.

### Support status

| Host | Status | Verified evidence |
| --- | --- | --- |
| Codex Windows App `26.825.6671.0` / CLI `0.144.3` | Official | Real isolated install, Guard chain, self-check, and uninstall from C7 |
| Claude Code `2.1.260` | Official | Official-contract comparison and automated package checks from C8; not tested in a real Claude Code host |
| OpenCode `1.18.18` | Official | Real isolated install, native command registration, Guard chain, self-check, and uninstall from C9 |
| DSH `0.1.1-rc.2` | Experimental | C10 real isolated lifecycle result: `VERIFIED_COMPATIBLE`; this result does not apply to another DSH version |

### Before you install

Install [Git](https://git-scm.com/), Node.js `24.11.1`, pnpm `11.19.0`, and at least one supported coding-agent host. Then open a terminal and run:

```text
git clone https://github.com/Krypton-117/AsYouMeant.git
cd AsYouMeant
pnpm install --frozen-lockfile
pnpm build
```

Choose only the host you use.

#### Codex

From the AsYouMeant repository root:

```text
codex plugin marketplace add .
codex plugin add asyoumeant@asyoumeant
```

#### Claude Code

From the AsYouMeant repository root:

```text
claude plugin marketplace add .
claude plugin install asyoumeant@asyoumeant --scope user
```

This package is officially supported through contract verification, but this release does not claim a real-host Claude Code test.

#### OpenCode

Open your own project and create these paths if they do not exist:

```text
.opencode/plugins/
.opencode/asyoumeant-runtime/
.opencode/skills/
```

Copy the following built AsYouMeant files into that project:

```text
native/opencode/asyoumeant.js        -> .opencode/plugins/asyoumeant.js
native/opencode/dist/                -> .opencode/asyoumeant-runtime/dist/
native/opencode/skills/*             -> .opencode/skills/
```

Start OpenCode from your project directory. Its command list should include `asyoumeant-start`.

#### DSH (experimental)

Use only DSH `0.1.1-rc.2`. Replace `<profile>` with the profile you want to modify:

```text
dsh plugin --profile <profile> add ./native/dsh
```

The verified result is `VERIFIED_COMPATIBLE` for that exact version only.

### Use the pre-loop

Tell the agent what you want to build and ask it to use AsYouMeant's pre-loop. The agent should help you confirm, in plain language:

- the intended users and visible product behavior;
- what is inside and outside the task;
- the Component–Module–Product development tree;
- who runs and who accepts each node;
- tests, failure handling, dependencies, external actions, and unattended work;
- the exact evidence that means the product is complete.

The living specification is the only authority. Generated contracts, ledgers, acceptance packs, and task-local Skills are projections of it and cannot add permission. Before implementation, an independent read-only gate checks intent, permissions, technical feasibility, and internal logic. A failed gate returns a concise conflict report; it never starts work.

### Start the major-loop

After the gate passes, the agent gives you the exact candidate version. Replace `<contract-version>` below with that value and enter the command yourself:

| Host | Exact user command |
| --- | --- |
| Codex | `$major-loop-runner start candidate=<contract-version>` |
| Claude Code | `/asyoumeant:major-loop-runner start candidate=<contract-version>` |
| OpenCode | `/asyoumeant-start candidate=<contract-version>` |
| DSH `0.1.1-rc.2` | `/asyoumeant-major-loop-runner start candidate=<contract-version>` |

An ordinary “continue,” an old candidate, or a command sent before the gate passes must not start implementation.

### What success looks like

You should see these effects:

- Before the exact start, implementation actions are denied.
- After the exact start, only the approved current node may run.
- Each Component is accepted before assembly; each Module level and the final Product has its own acceptance mode.
- Program behavior and critical paths are shown to you unless the pre-loop explicitly approved automatic acceptance for that node.
- A failed action produces a specific reason and next step instead of an open-ended retry loop.

For a safe local demonstration, run:

```text
pnpm demo:m2
```

The output should show a pre-start action denied and the same necessary action allowed through a valid permit.

### Stop or pause

Tell the agent directly to stop or pause. Direct user control has priority over an active loop; the current node must checkpoint or cancel and no new work may start. You can also use the host's normal stop control. Restarting implementation requires a still-valid reviewed contract and its exact start command.

### Uninstall

Codex:

```text
codex plugin remove asyoumeant@asyoumeant
codex plugin marketplace remove asyoumeant
```

Claude Code:

```text
claude plugin uninstall asyoumeant@asyoumeant --scope user
```

OpenCode: remove `.opencode/plugins/asyoumeant.js`, `.opencode/asyoumeant-runtime/`, and the four AsYouMeant directories under `.opencode/skills/`: `pre-loop-governor`, `major-loop-runner`, `diagnostic-kernel`, and `evidence-research`.

DSH:

```text
dsh plugin --profile <profile> remove asyoumeant-dsh
```

<!-- PROFESSIONAL_GUIDE -->
## Professional guide

### Design

AsYouMeant keeps one reviewed living specification as the normative source. The contract compiler, DAG, ledger, Guard policy, acceptance package, and any task-local Skill are derived projections. A projection may make the specification executable but may not override it.

The stable core deliberately contains only contract compilation, evidence resolution, replayable state, Guard and permit decisions, major-loop execution, bounded diagnostics, independent review, conformance, and thin host adapters. Upstream frameworks contribute selected capabilities, not mandatory universal workflows. General-purpose TDD, planning, review, Git, delegation, and release loops are not imposed.

The four stable Skills are:

- `pre-loop-governor`: infer, confirm, and maintain the contract while implementation stays locked.
- `major-loop-runner`: execute only the current approved projection after a native start source creates a valid permit.
- `diagnostic-kernel`: investigate an existing failure with explicit hypotheses and a bounded distinguishing probe.
- `evidence-research`: gather high-trust primary evidence for a named decision or approved research task.

A task-local working Skill may be created only for a foreseeable reusable loop with named consumers. It is bound to the current intent, inputs, outputs, allowed actions, resources, completion criteria, and expiry condition; it disappears when its last consumer closes.

### Component–Module–Product model

A Component is the unique smallest indivisible feature unit and always a leaf. A Module recursively assembles Components and/or lower Modules and may be omitted. The Product is the unique root and final deliverable. `ASSEMBLES` expresses containment; `REQUIRES` expresses execution prerequisites. Empty Modules, cycles, or unreachable nodes are invalid.

Every Component, every assembled Module level, and the Product independently selects one of three modes:

1. attended execution and user acceptance;
2. unattended execution followed by user acceptance;
3. unattended execution with automatic testing and acceptance.

Evidence is bound to a node, criterion, implementation identity, environment, and execution identity. A relevant change invalidates only that node and its assembly ancestors, so unchanged evidence can be reused.

### Contract, gate, and Guard

The pre-loop gate is read-only and separate from implementation. It checks intent alignment, authority, technical feasibility, and internal consistency against the same candidate. Passing the gate still creates no execution authority; only the host-native exact start command creates a short-lived permit.

The Guard evaluates file, dependency, test, retry, network, delegation, external-write, hardening, hashing, and privilege-expansion actions. It preserves necessary consequences but rejects scope creep, speculative hardening, intent violations, and task thrashing. Decisions are `allow`, `observe`, or `deny`, with a reason code and permitted next step. Host sandbox and security rules remain independently effective.

### Host adapters and evidence

| Adapter | Native start seam | Guard seam | Evidence |
| --- | --- | --- | --- |
| Codex | `UserPromptSubmit` plus explicit Skill invocation | native pre-tool hook | C7 real isolated lifecycle |
| Claude Code | namespaced `UserPromptExpansion` | `PreToolUse` | [C8 contract evidence](native/claude/CONTRACT-EVIDENCE.json) |
| OpenCode | registered command and `command.execute.before` | `tool.execute.before` | [C9 contract evidence](native/opencode/CONTRACT-EVIDENCE.json) plus real isolated lifecycle |
| DSH `0.1.1-rc.2` | explicit bundled Skill invocation | `tools/pre-execute` | [C10 real evidence](native/dsh/CONTRACT-EVIDENCE.json) |

Codex, Claude Code, and OpenCode are the official three-host set. DSH is a separate Profile Bundle, is not a core dependency, and must remain labelled experimental even when its exact-version probe is compatible.

### Repository map

```text
src/contracts/       living-spec contract compilation
src/evidence/        decision-bound primary evidence
src/state/           append-only ledger and replay
src/guard/           deterministic policy and permit checks
src/runner/          node execution, checkpoints, and control
src/diagnostics/     bounded failure diagnosis
src/hosts/           thin host adapters and lifecycle checks
src/conformance/     independent review and release projections
native/              installable host packages
test/                Component acceptance suites
scripts/             verification, demo, probe, and release checks
```

### Development and validation

The frozen toolchain is Node.js `24.11.1`, TypeScript `7.0.2`, ESM, JSON Schema 2020-12, Ajv `8.20.0`, pnpm `11.19.0`, and `node:test`. Ajv is the only core runtime dependency; DSH and the three upstream skill collections are not runtime dependencies.

```text
pnpm install --frozen-lockfile
pnpm build
pnpm verify --node C<n>
pnpm conformance
pnpm demo:m2
pnpm release:check
```

`pnpm verify --node C<n>` runs a named Component's acceptance suite. `pnpm conformance` validates the assembled host matrix. `pnpm release:check` checks release inputs, versions, bilingual documentation, DSH evidence, secret-shaped text, and license obligations.

### License and upstream attribution

AsYouMeant-owned source is licensed under [MPL-2.0](LICENSE). MPL-2.0 obligations apply at the covered-file level; this project does not relabel independent upstream MIT material as MPL-2.0. Selected or adapted material from Superpowers `6.3.0`, Stop That Shit `0.2.0`, and Matt Pocock Skills manifest `1.2.3` retains its attribution and MIT terms in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

