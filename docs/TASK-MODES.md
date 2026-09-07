# Task modes and Hook boundaries

## Authority

Ordinary sessions do not run AYM governance. Host permissions still govern all actions, including writes and external effects. Research sessions allow only recognized reads within the scope approved by the user and host. They do not require a reviewed development contract or a major-loop permit. AYM sessions require explicit user activation, pre-loop, independent review and a native user start before implementation.

This session-level governance state is separate from the existing contract `policy.taskMode` (`answer`, `review`, `monitoring`, `change`, etc.). The latter still constrains formal contracted work. The runner and direct Guard consumers remain AYM consumers by default; host adapters explicitly pass their session governance mode.

## Activation and exit

| Host | Mode selection | Major-loop start |
| --- | --- | --- |
| Codex | Direct user message `AYM mode ordinary`, `AYM mode research`, `AYM mode aym` | `$major-loop-runner start candidate=<contract-version>` |
| Claude Code | Same direct messages through `UserPromptSubmit` | `/asyoumeant:major-loop-runner start candidate=<contract-version>` through the verified plugin expansion |
| OpenCode | `/asyoumeant-mode ordinary`, `/asyoumeant-mode research`, `/asyoumeant-mode aym` | `/asyoumeant-start candidate=<contract-version>` |
| DSH | Same direct messages through `agent/pre-step` | `/asyoumeant-major-loop-runner start candidate=<contract-version>` plus native injected Skill evidence |

Direct prompts beginning with `Use AYM`, `Use AsYouMeant`, `使用 AYM`, `使用 pre-loop`, `进入 major-loop`, or `按 AYM 合同开发` also activate AYM on exposed user prompt paths. The OpenCode legacy `chat.message` adapter filters synthetic text; its native mode command is the deterministic entry. Generic coding requests, quoted examples and mentions inside documents do not activate it. Recognition is deliberately conservative, not semantic intent inference: use the exact mode command when a longer or ambiguous request is not recognized. Ask only the minimal intent question when different interpretations change authority.

Mode persists in a session. An unrelated follow-up does not silently disable an active mode. Explicitly switching mode clears the permit, including switching back to AYM; a new native start is required. A new session defaults to ordinary regardless of a workspace contract. AYM plugin administrative mode/permit state writes are control-plane operations, not permission to write task output in research mode.

## Read-only boundary

Recognized tools include `read`, `read_file`, `read_image`, `view_image`, `grep`, `glob`, `list`, `ls`, `webfetch`, `websearch` and `web_search`. Codex-style `web.run`/`web__run` accepts only its known read operations. Tool names are exact matches: a name such as `get_and_delete` cannot inherit read permission.

The TypeScript adapters also accept a small shell grammar for `cat`, `Get-Content` and `rg`: simple arguments and a fixed option list, with no pipelines, redirections, substitutions, scripts or preprocessors. Unknown options and compound commands are denied. Use a dedicated read tool or separate simple reads when rejected. DSH uses its native read tool whitelist and does not classify arbitrary shell commands.

Research denies file creation, edits, deletion, moves, dependency installation, configuration changes, tests, servers, implementation commands, Git commits/pushes, publishing, external messages, delegation and unknown wrappers. `functions.exec`, arbitrary shell scripts and Skill execution are not proven read-only. Advice rendered only in chat remains available. Host destination, credential, filesystem and network approval boundaries still apply; AYM does not grant those permissions or inspect every possible redirected HTTP destination.

An AYM permit also does not grant blanket authority to unknown commands or wrappers. Use recognized tools with visible effects and targets. This restriction is independent of optional observation settings.

## Trigger chain and state

Before this repair, Codex/Claude loaded a workspace contract on every `PreToolUse` and selected `pre-start` whenever no session permit existed. OpenCode did the same in `tool.execute.before`, while caching its first contract. Shared Guard treated every `network` action as sensitive even with `mutability=read`; Codex also classified `web.run` as unknown. DSH denied non-whitelisted tools even without a valid contract. There was no session opt-in state. Global Skill pool filtering was another source of cross-session interference.

The adapters now resolve session mode before AYM admission. OpenCode reloads the contract for each governed action, and Skill admission is checked on the governed session's tool path rather than globally removing Skills. Read-only network actions no longer require a start permit in shared Guard; contracted AYM network destinations still undergo policy checking.

Codex stores state under `ASYOUMEANT_STATE_DIR`, otherwise `CODEX_HOME/asyoumeant-state` or the contract directory's `asyoumeant-state`. Claude uses `CLAUDE_PLUGIN_DATA`, otherwise the contract directory's `asyoumeant-claude-state`. OpenCode uses `ASYOUMEANT_STATE_DIR` or `.asyoumeant/opencode-state`, with session files under `permits/`. Session IDs are encoded without lossy replacement; mode and permit files are atomically replaced. Old sanitized-name permits do not automatically enable governance or migrate into authority. Restart into a new task and explicitly choose a mode after updating the plugin.

Permit issuance still checks independent review, candidate, projection, host/source/command, user actor, adapter verification and lifetime. Guard checks these again at execution, including expiry, paused/stopped state and allowed paths/actions. Mode changes remove prior permits. DSH keeps mode and permit in per-agent weak maps; restart loses them. It checks review bindings, time and its allowed-tool list, but does not implement the full TypeScript path/dependency policy.

## Validation boundary

The regression suite exercises ordinary reads without permits, strict research effects, explicit AYM gating, session isolation and persistence, stale permits and readable next steps. C7 checks real Codex installation/removal plus direct Hook invocation; this is not proof of every desktop UI event. C8 checks the Claude package and spawned Hook process, not a live authenticated Claude session. C9 checks real OpenCode command registration plus direct adapter calls, not every model-generated tool path. DSH C10 tests injected middleware; authenticated model execution is separately gated by `scripts/probe-dsh.mjs`.

Hooks only cover events exposed by the host. Missing events, custom tools, synthetic prompt paths and installed older plugin caches are not claimed as verified enforcement. Updating repository files does not update an already installed plugin cache: rebuild, reinstall and restart the host. Do not interpret historical compatibility evidence as a new live-host run.

MPL-2.0 remains unchanged; license policy is unrelated to this Hook correction.

## Verification on 2026-09-07

| Check | Result |
| --- | --- |
| Baseline `node --test dist/test/*.test.js test/*.test.mjs` | 106/107 passed; OpenCode `--version` timed out |
| `node node_modules/typescript/bin/tsc -p tsconfig.json` | Passed using Node.js 24.11.1 |
| Final full test command above | 112/112 passed |
| `node scripts/release-check.mjs` | PASS, no failures |
| `node scripts/demo-m2.mjs` | Permit, pause, recovery and stop demo passed |
| Local Markdown links in both READMEs and both documents | 9 targets resolved |
| External Markdown links | 14 HEAD requests attempted; this shell's outbound HTTPS returned EACCES, so remote availability is unverified |
| `git diff --check` | Passed |
| Runtime state tracking | `.asyoumeant/`, `.pnpm-store/`, `.work/` ignored and no tracked files in them |
| `node scripts/probe-dsh.mjs --dsh-bin <local DSH lib/bin.js>` | WAITING_USER / DSH_AUTHENTICATION_REQUIRED; not a passed authenticated run |

The available `pnpm build` wrapper selected its bundled Node.js 24.19.0 and automatically attempted dependency installation, which failed with Windows EPERM. The equivalent repository compiler and script entry points above were run directly with the pinned Node.js 24.11.1. Package manifests, lockfile and LICENSE were not changed.

Subsequent 0.3.1 release preparation increments package manifest versions; dependency versions, lockfile and LICENSE remain unchanged. The release rerun also passed all 112 tests, compilation, release check and demo.

OpenCode passed real lifecycle validation on the final run, but also exhibited an intermittent command endpoint stall during verification. The lifecycle probe now bounds each HTTP request to two seconds so its overall startup deadline cannot be defeated by an indefinitely pending fetch. This change does not claim to repair the external host's intermittent startup behavior.
