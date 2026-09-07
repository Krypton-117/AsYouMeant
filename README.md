[简体中文](README.zh-CN.md)

# AsYouMeant 0.3.1

[Release notes / 更新说明](CHANGELOG.md): task-scoped activation and read-only research without a major-loop permit.

**Make the coding agent build what you meant—not merely what it guessed.**

AsYouMeant is a contract-governed development plugin for Codex, Claude Code, and OpenCode, with experimental DSH support. Before implementation, it turns your conversation into one reviewed living specification. During implementation, it admits only the work, Skills, checks, and delivery actions that specification authorized.

<!-- BEGINNER_GUIDE -->

## 1. Use AsYouMeant

### What it does

Coding agents can start too early, misunderstand an ordinary phrase, add reasonable-looking work you never requested, or run many checks without proving the result you care about. AsYouMeant separates four jobs:

1. **pre-loop** — discuss what should be built and record it in plain language;
2. **independent gate** — check intent, permissions, technical feasibility, and internal logic;
3. **major-loop** — build only the approved Components and assemble them into the Product;
4. **post-loop** — optionally retain useful Skill experience without changing the delivered Product.

You decide the intended users, features, visible behavior, acceptance mode, and external effects. The agent is responsible for technical consistency, commands, dependencies, and precise conflict reports. You do not need to know programming vocabulary before starting.

### Is it for you?

Use AsYouMeant when you want:

- a long requirements discussion before any implementation;
- one readable source of truth instead of scattered plans and ledgers;
- an explicit Component–Module–Product development tree;
- different acceptance modes for different parts of one Product;
- hard stops for unapproved files, tests, dependencies, retries, delegation, or publishing;
- Skills selected for the current intent instead of a universal workflow.

It is intentionally heavier than a normal chat for tiny, disposable changes. It also cannot guarantee that an agent, host, test, or specification is bug-free. Its job is to make authority, intent, evidence, and failure visible and bounded.

### Install

#### Requirements

Install:

- [Git](https://git-scm.com/);
- Node.js `24.11.1`;
- pnpm `11.19.0`;
- at least one supported coding-agent host.

Build AsYouMeant once:

```text
git clone https://github.com/Krypton-117/AsYouMeant.git
cd AsYouMeant
pnpm install --frozen-lockfile
pnpm build
```

Then install only the host package you use.

#### Codex

From the AsYouMeant repository root:

```text
codex plugin marketplace add .
codex plugin add asyoumeant@asyoumeant
```

After installing or updating the plugin, restart Codex and open a new task so its prompt and tool Hooks are loaded.

#### Claude Code

From the AsYouMeant repository root:

```text
claude plugin marketplace add .
claude plugin install asyoumeant@asyoumeant --scope user
```

The repository verifies the Claude plugin contract and prebuilt Hook path; it does not claim a real Claude Code host run for this release.

#### OpenCode

Run the following from the AsYouMeant repository root. Replace the example path with the project in which you want to use OpenCode.

PowerShell:

```powershell
$TargetProject = "C:\path\to\your-project"
New-Item -ItemType Directory -Force "$TargetProject\.opencode\plugins", "$TargetProject\.opencode\asyoumeant-runtime", "$TargetProject\.opencode\skills"
Copy-Item native/opencode/asyoumeant.js "$TargetProject\.opencode\plugins\asyoumeant.js" -Force
Copy-Item native/opencode/dist "$TargetProject\.opencode\asyoumeant-runtime\dist" -Recurse -Force
Copy-Item native/opencode/skills/* "$TargetProject\.opencode\skills\" -Recurse -Force
```

Bash:

```bash
TARGET_PROJECT="/path/to/your-project"
mkdir -p "$TARGET_PROJECT/.opencode/plugins" "$TARGET_PROJECT/.opencode/asyoumeant-runtime" "$TARGET_PROJECT/.opencode/skills"
cp native/opencode/asyoumeant.js "$TARGET_PROJECT/.opencode/plugins/asyoumeant.js"
cp -R native/opencode/dist "$TARGET_PROJECT/.opencode/asyoumeant-runtime/"
cp -R native/opencode/skills/* "$TARGET_PROJECT/.opencode/skills/"
```

Start OpenCode from the target project. Its command list should include `asyoumeant-start`.

#### DSH — experimental

Only the exact `0.1.1-rc.2` host version is in scope. Replace `<profile>` with the profile you use:

```text
dsh plugin --profile <profile> add ./native/dsh
```

DSH is a best-effort experimental adapter, not a general compatibility guarantee.

DSH's official community discovery mechanism is the GitHub [`dsh-plugin` topic](https://github.com/topics/dsh-plugin). AYM follows that mechanism and ships a standalone Profile Bundle; this is not an official endorsement or a claim of npm publication. See [DSH distribution and discovery](docs/DSH-DISTRIBUTION.md).

To build a portable installer from this repository:

```text
pnpm pack:dsh
dsh plugin --profile <profile> add ./.work/packages/asyoumeant-dsh-0.3.1.tgz
```

The DSH evidence conclusion `VERIFIED_COMPATIBLE` applies only to the exact `0.1.1-rc.2` host version and the tested contract boundary.

#### Verify the local build

From the repository root:

```text
pnpm build
pnpm demo:m2
```

The `demo:m2` command exercises the visible permit, pause, recovery, and stop path without changing a Product.

The `0.2.0 → 0.3.0` migration adds the optional Skill pool projection, task-local Skill handling, conditional test-first evidence, and advisory post-loop experience storage. Existing 0.2 contracts remain readable when the new projection is absent.

### Start your first pre-loop

Installing AYM or having `.asyoumeant/contract.json` does not enable governance for a new session. Ordinary tasks use the host's normal permissions, including its approval rules for writes and external effects; they never need an AYM permit.

| Mode | Behavior |
| --- | --- |
| Ordinary (default) | No AYM gate; reads, web research and ordinary development use host permissions. |
| Research | Only recognized read-only tools within host-approved scope; no file changes, installs, tests/services, publishing, messages or other side effects. No major-loop permit. |
| AYM | Explicit opt-in, pre-loop, independent review, then a direct native start command before implementation. |

Send `AYM mode research`, `AYM mode aym`, or `AYM mode ordinary` as a direct user message in Codex, Claude Code or DSH. In OpenCode use `/asyoumeant-mode research`, `/asyoumeant-mode aym`, or `/asyoumeant-mode ordinary`. Switching invalidates the old permit. Mode persists in the current session; a new session starts ordinary. A mention of AYM in a document or a generic coding request is not activation.

The explicit pre-loop request below enables AYM where a direct user prompt Hook is available. For OpenCode the mode command is the deterministic entry. Ambiguous prose needs clarification only when the interpretation changes authority. See [task modes and Hook boundaries](docs/TASK-MODES.md) for recognized tools, migration and host verification limits.

Send this in your coding agent and replace the bracketed text:

```text
Use AsYouMeant to prepare a pre-loop for: [describe what you want].
Do not implement yet. Explain each decision for a complete beginner and keep one living specification as the only authority.
```

The agent should help you confirm:

- who the Product is for and what problem it solves;
- what the finished result should visibly do;
- what is included and excluded;
- the Component–Module–Product tree;
- the execution and acceptance mode of every node;
- unattended work, tests, permissions, failure handling, and delivery;
- what evidence is sufficient to call each node complete.

You can use approximate names. The agent should infer the most likely intent and explain it in ordinary language. It should ask only when two interpretations would materially change the result or authority.

### Start the major-loop

Implementation stays locked until the living specification passes its independent gate. The agent then gives you an exact candidate version. Enter the native command yourself:

| Host | Exact command |
| --- | --- |
| Codex | `$major-loop-runner start candidate=<contract-version>` |
| Claude Code | `/asyoumeant:major-loop-runner start candidate=<contract-version>` |
| OpenCode | `/asyoumeant-start candidate=<contract-version>` |
| DSH `0.1.1-rc.2` | `/asyoumeant-major-loop-runner start candidate=<contract-version>` |

Replace `<contract-version>` with the value in the reviewed living specification. “Continue,” a stale version, a command sent before the gate, or an agent-generated command does not authorize implementation.

### What you will see

Work is delivered from the bottom up:

```text
Component → optional nested Module(s) → Product
```

A Component is the smallest indivisible feature. Modules assemble Components or lower Modules. The Product is the one final deliverable. Every Component, every Module level, and the Product has its own acceptance choice, so one task may combine:

- attended work and user acceptance;
- unattended work followed by user acceptance;
- unattended work with automatic checking and acceptance.

When a result needs human judgment, the agent gives you a short, concrete way to see it. When automatic acceptance was agreed, the agent applies the named rule without asking you to inspect technical logs.

### Stop, change, or remove it

You may stop or narrow the task at any time. A change that affects intent, permission, cost, or external behavior returns to pre-loop and invalidates the old start authority.

Uninstall Codex:

```text
codex plugin remove asyoumeant@asyoumeant
codex plugin marketplace remove asyoumeant
```

Uninstall Claude Code:

```text
claude plugin uninstall asyoumeant@asyoumeant --scope user
```

For OpenCode, remove `.opencode/plugins/asyoumeant.js`, `.opencode/asyoumeant-runtime/`, and the five AsYouMeant Skill directories under `.opencode/skills/`.

Uninstall DSH:

```text
dsh plugin --profile <profile> remove asyoumeant-dsh
```

<!-- PROFESSIONAL_GUIDE -->

## 2. Why AsYouMeant is built this way

### The three questions: object, problem, intent

AsYouMeant begins with three questions:

- **Object** — who or what will consume the result?
- **Problem** — what observable difficulty must change?
- **Intent** — what outcome and authority did the user actually mean?

A feature without a consumer is suspect. A procedure without a named problem is optional at best. A technically valid result that contradicts the intended outcome is still wrong.

This is why the living specification, not a generic workflow, is the center of the system.

### Starting from Superpowers—and taking the framework apart

[Superpowers](https://github.com/obra/superpowers) demonstrated several valuable ideas: ask before coding, turn discussion into a specification, plan the work, use real feedback loops, and review the result. It also presents itself as a complete development methodology whose Skills automatically drive a broad workflow through planning, TDD, subagents, review, and completion.

That completeness is useful when the workflow fits. It becomes expensive or misaligned when every task inherits procedures that its user, product, or acceptance rule does not consume.

The research is more nuanced than “an OpenAI paper proved Superpowers inefficient.” [SkillsBench](https://arxiv.org/abs/2602.12670) is not an OpenAI publication and did not benchmark Superpowers by name. It reported a strong average benefit from curated Skills, while also finding that focused sets with at most three modules outperformed larger or exhaustive bundles. A later [Microsoft Research study](https://www.microsoft.com/en-us/research/publication/agent-skills-can-be-harmful-an-empirical-study-of-skill-induced-failures-in-llm-agents/) attributed both functional failures and efficiency regressions to apparently relevant Skills, with excessive verification and heavy implementation pipelines among the largest procedural causes.

AsYouMeant therefore did not reject Superpowers. It decomposed it. Clarification, planning, test-first work, debugging, review, and verification remain available capabilities, but none becomes a universal obligation. The current contract decides whether each capability has a consumer.

### Why Stop That Shit became the brake

A sentence such as “do not over-engineer” is advisory. An agent can still rationalize another test, checksum, compatibility layer, subagent, or “helpful” release step.

[Stop That Shit](https://github.com/lennney/stop-that-shit) showed how to turn clear boundaries into executable Hooks and Guards. AsYouMeant absorbed that separation:

- the living specification says **what is authorized**;
- Skills provide bounded help for **how to do it**;
- the Guard says **no** when an action exceeds the reviewed authority.

The Guard does not decide product intent. It blocks actions such as out-of-scope writes, unapproved dependencies, consumerless tests, repeated diagnostics, excess delegation, speculative hardening, hashing, network access, and external publishing when the contract does not allow them. Host security and sandbox controls remain independently effective.

### What Matt Pocock changed

[Matt Pocock’s Skills collection](https://github.com/mattpocock/skills) argues for Skills that are small, adaptable, and composable instead of a framework that owns the entire process. AsYouMeant adopted that lesson and made the consumer explicit.

A Skill is not “good” in the abstract. It is good for a particular intent, action boundary, input, output, resource set, and completion rule. The agent first looks for an existing fit. If none exists, it may create a tightly scoped task-local Skill only for a named technology failure, context-overflow recovery, or foreseeable reusable loop. When the last consumer disappears, the Skill leaves the active pool but is not deleted.

The result is a dynamic Skill pool, not a permanent pile of instructions.

### How the project evolved

- **0.1** established contract authority, replayable state, Guard decisions, bounded diagnostics, and the Component–Module–Product model.
- **0.2** added native host packages, independent gates, explicit start permits, acceptance presentation, and delivery boundaries.
- **0.3** added the dynamic Skill pool, intent-specific task-local Skills, two-axis review, conditional test-first evidence, and a separate advisory post-loop.

The progression is deliberate: first define authority, then enforce it across hosts, then make reusable capabilities dynamic.

### What is actually new

AsYouMeant does not claim to have invented specifications, gates, DAGs, Hooks, acceptance trees, Skill creation, or retrospectives. Nearby work already includes:

- [Spec Kit](https://github.com/github/spec-kit) for spec-driven development;
- [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) for adaptive, phase-oriented AI development;
- [MUSE-Autoskill](https://arxiv.org/abs/2605.27366) for creating, retrieving, evaluating, and refining Skills across tasks.

Within the public material examined for this project, we did not find an exact isomorphic implementation of the complete AsYouMeant combination. The defensible innovation claim is narrower: **AsYouMeant is an original methodological synthesis and engineering practice that combines one living intent document, an independently reviewed authorization boundary, recursive per-node acceptance, and a consumer-bound dynamic Skill lifecycle.**

That is a claim about the combination and its implementation—not a claim of global firstness, guaranteed correctness, or ownership of the underlying ideas.

## 3. Technical design

### Architecture

```text
conversation
    ↓
one living specification
    ↓ compile projections
contract · node graph · acceptance · Guard · Skill pool
    ↓
independent read-only gate
    ↓ exact native user start
major-loop: Component → Module(s) → Product
    ↓
optional advisory post-loop
```

The TypeScript core is host-neutral. Each host package translates its native prompt, command, Skill, and tool events into the same contract and Guard model. Adapters are deliberately thin so host-specific behavior does not become product logic.

### One authority, many projections

The reviewed living specification is normative. Runtime JSON, node cards, ledgers, acceptance packages, Guard policy, and task-local Skills are projections. A projection may make a decision executable, but it cannot add files, tests, dependencies, permissions, delegation, delivery, or completion criteria that the living document did not authorize.

The agent owns technical validation of those projections. The user owns the intended behavior and external consequences.

### Recursive Product graph

The graph has exactly one Product root. A Component is always a leaf. A Module may assemble Components and lower Modules recursively and is optional.

- `ASSEMBLES` describes composition.
- `REQUIRES` describes execution prerequisites.
- Cycles, empty Modules, duplicate implementations, unreachable nodes, and multiple Product roots are invalid.
- A node can run only when its dependencies, inputs, permissions, and resources are ready.
- A relevant change invalidates that node and its assembly ancestors, not unrelated accepted work.

This gives small work a flat graph and complex work as much nesting as it actually needs.

### Gate, permit, and Guard

The independent gate is read-only. It checks four axes against the same frozen candidate:

1. intent traceability;
2. permission containment;
3. technical feasibility;
4. internal consistency.

A passing review does not itself start implementation. The host-native user action must create a candidate-bound, projection-bound, time-limited permit. The Guard then evaluates sensitive actions against the active work item and contract policy.

Guard outcomes are deterministic where the host exposes the necessary event:

- `allow` — the action is mapped and inside authority;
- `observe` — the boundary is uncertain or the host cannot enforce it completely;
- `deny` — the action conflicts with a known boundary and must not run.

Hooks cover only the event paths exposed by a host. AsYouMeant does not describe a missing Hook as successful enforcement.

### Acceptance is part of the contract

Acceptance is assigned independently to every Component, Module, and Product. Execution and acceptance may be attended or unattended, and automated checks may be selected per node.

Possible reported results mean:

| Result | Meaning |
| --- | --- |
| Automated pass | The named oracle accepted evidence bound to the current node and implementation identity. |
| User-visible accepted | The user followed a short visible check and accepted the observed result. |
| Approved without runtime test | Static or inherited evidence was sufficient. This must not be reported as “tests passed.” |
| Conflict stopped | Work halted before changing intent, exceeding permission, or consuming unsupported assumptions. |
| Aggregate closed | Every direct child is accepted, so the Module or Product closes without duplicate testing. |
| Insufficient evidence | The node remains incomplete; uncertainty is not silently converted into success. |

The repository may contain detailed evidence artifacts, but the README intentionally explains their semantics rather than presenting a release audit log.

### Dynamic Skill lifecycle

The stable set contains five narrow Skills:

| Skill | Consumer |
| --- | --- |
| `pre-loop-governor` | Intent discussion and contract preparation |
| `major-loop-runner` | Authorized execution of the current projection |
| `diagnostic-kernel` | One evidence-bound, discriminating probe for an existing failure |
| `evidence-research` | One named technical uncertainty for one contracted consumer |
| `post-loop-curator` | Evidence-backed Skill evaluation after Product closure |

The logical pool follows this lifecycle:

```text
discover existing Skill
    ↓ fit?
in-pool ── use for named consumer
    ↓ last consumer closes
out-of-pool, file retained
    ↓ future consumer appears
re-evaluate before re-entry
```

Task-local generation is a fallback, not a default. The generated Skill binds its trigger, contract pointer, consumers, allowed actions, resources, inputs, outputs, completion criteria, and expiry. The shared `~/.asyoumeant/skill-experience.md` records evidence-backed fit and improvement ideas, but it has no execution, admission, permission, or acceptance authority.

### Host adapters

| Host | Native integration | Boundary |
| --- | --- | --- |
| Codex | Plugin Skills, `UserPromptSubmit` start recognition, and `PreToolUse` Guard | Restart or open a new task after installation so Hooks load |
| Claude Code | Namespaced Skill expansion and `PreToolUse` Hook | Uses documented plugin and Skill controls |
| OpenCode `1.18.18` | Command transform, Skill transform/reload, permission Hook, and tool Guard | Installed into the target project |
| DSH `0.1.1-rc.2` | Profile bundle, explicit start Skill, and provider filtering | Experimental, exact-version, best-effort support |

Logical isolation is mandatory. Physical hiding of out-of-pool Skills is used only where the host supports it safely.

### Repository layout

```text
src/contracts/       contract types, schema, and compilation
src/evidence/        decision-bound evidence resolution
src/state/           append-only state and replay
src/guard/           deterministic policy and permit checks
src/runner/          node execution and checkpoints
src/diagnostics/     bounded failure diagnosis
src/skills/          pool and task-local Skill compilation
src/post-loop/       advisory experience curation
src/hosts/           thin host adapters
src/conformance/     independent review and result presentation
native/              installable host packages
test/                node-focused checks
scripts/             build, verification, probe, and release utilities
```

The frozen development stack is Node.js `24.11.1`, TypeScript `7.0.2`, ESM, JSON Schema 2020-12, Ajv `8.20.0`, pnpm `11.19.0`, and `node:test`. Ajv is the only core runtime dependency. Host SDKs and the three upstream Skill collections are not core runtime dependencies.

### Compatibility and extension

Existing 0.2 contracts remain readable because the 0.3 `skillPool` projection is optional. A host adapter may expose stronger physical isolation, but it must preserve the same logical contract and may not weaken host security.

An extension should be added only when it has:

- a named consumer and problem;
- a traceable intent source;
- explicit actions, inputs, outputs, resources, and completion rules;
- a defined invalidation and failure path;
- no duplicate owner elsewhere in the system.

Potential improvements remain proposals until primary-source research supports them and the user directly authorizes implementation.

### License

AsYouMeant-owned source is licensed under [MPL-2.0](LICENSE). Selected or adapted material from Superpowers, Stop That Shit, and Matt Pocock Skills retains its MIT attribution in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). AsYouMeant does not relabel independent upstream MIT material as MPL-2.0.

## Sources and acknowledgements

Project and methodology sources:

- [Superpowers](https://github.com/obra/superpowers)
- [Stop That Shit](https://github.com/lennney/stop-that-shit)
- [Matt Pocock Skills](https://github.com/mattpocock/skills)
- [GitHub Spec Kit](https://github.com/github/spec-kit)
- [BMAD Method](https://github.com/bmad-code-org/BMAD-METHOD)

Research:

- [SkillsBench: Benchmarking How Well Agent Skills Work Across Diverse Tasks](https://arxiv.org/abs/2602.12670)
- [Agent Skills Can Be Harmful: An Empirical Study of Skill-Induced Failures in LLM Agents](https://www.microsoft.com/en-us/research/publication/agent-skills-can-be-harmful-an-empirical-study-of-skill-induced-failures-in-llm-agents/)
- [MUSE-Autoskill: Self-Evolving Agents via Skill Creation, Memory, Management, and Evaluation](https://arxiv.org/abs/2605.27366)

Host documentation:

- [Codex Skills](https://learn.chatgpt.com/docs/build-skills)
- [Claude Code Skills](https://code.claude.com/docs/en/skills)
- [OpenCode Skills](https://opencode.ai/v2/docs/skills) and [plugins](https://opencode.ai/v2/docs/build/plugins/)
- [DSH Skills subsystem](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)
