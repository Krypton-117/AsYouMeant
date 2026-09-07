// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { handleCodexHook, MemoryCodexPermitStore } from "../src/hosts/codex/adapter.js";
import { handleOpenCodeTool, MemoryOpenCodePermitStore } from "../src/hosts/opencode/adapter.js";
import type { CodexRuntimeContract } from "../src/hosts/codex/adapter.js";
import { handleClaudeHook, MemoryClaudePermitStore } from "../src/hosts/claude/adapter.js";
import { handleOpenCodeCommand } from "../src/hosts/opencode/adapter.js";
import { FileSessionStore, requestedMode } from "../src/guard/session.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const runtime = (): CodexRuntimeContract => ({
  candidateVersion: "v1", projectionIdentity: "p1",
  review: { result: "PRE_LOOP_REVIEW_PASSED", candidateVersion: "v1", projectionIdentity: "p1" },
  nativeStartPaths: [{ host: "codex", sourceKind: "codex-user-prompt-submit", command: "$major-loop-runner start candidate=v1" }],
  activeWorkItemId: "work", actionBasis: { kind: "requested", requirementIds: ["request"] }, permitDurationMs: 60000,
  policy: { taskMode: "change", controlLevel: "hard-lock", executionState: "active", allowedWorkItemIds: ["work"],
    allowedPaths: ["src/**"], dependencyPolicy: "deny", allowedDependencies: [], hashPolicy: "deny", allowedHashConsumerIds: [],
    agentBudget: 0, agentsUsed: 0, allowedTestIds: [], retryBudget: 0, allowedNetworkTargets: ["example.com"],
    allowedExternalWriteTargets: [], deliveryAllowed: false }
});

test("research allows reads and denies side effects across all TypeScript adapters", () => {
  for (const host of ["codex", "claude", "opencode"] as const) {
    const store = host === "codex" ? new MemoryCodexPermitStore() : host === "claude" ? new MemoryClaudePermitStore() : new MemoryOpenCodePermitStore();
    const contract = runtime();
    if (host === "opencode") handleOpenCodeCommand({ command: "asyoumeant-mode", arguments: "research", sessionID: "task" }, contract, store);
    else (host === "codex" ? handleCodexHook : handleClaudeHook)({ hook_event_name: "UserPromptSubmit", prompt: "AYM mode research", session_id: "task" }, contract, store);
    const run = (tool: string, input: unknown = {}) => host === "opencode"
      ? handleOpenCodeTool({ tool, sessionID: "task", callID: tool }, { args: input }, contract, store).decision
      : (host === "codex" ? handleCodexHook : handleClaudeHook)({ hook_event_name: "PreToolUse", session_id: "task", tool_name: tool, tool_use_id: tool, tool_input: input }, contract, store).decision!;
    for (const name of ["read", "grep", "websearch", "webfetch"]) assert.equal(run(name).outcome, "allow", `${host}:${name}`);
    assert.equal(run("web.run", { search_query: [{ q: "official docs" }] }).outcome, "allow");
    for (const cmd of ["Get-Content -LiteralPath 'src/a.ts'", "rg --files", "cat src/a.ts"]) assert.equal(run("bash", { command: cmd }).outcome, "allow", cmd);
    for (const cmd of ["cat a > b", "rg --pre evil pattern", "rg '--pre' evil pattern", "Get-Content a; Remove-Item a", "cat $(touch x)"]) assert.equal(run("bash", { command: cmd }).outcome, "deny", cmd);
    for (const [name, input] of [["write", {}], ["apply_patch", {}], ["bash", { command: "npm install x" }], ["bash", { command: "npm publish" }], ["exec_command", { cmd: "git commit -am change" }], ["functions.exec", { code: "writeFile()" }], ["send_message", {}], ["get_and_delete", {}], ["web.run", { upload: "file" }], ["skill", {}]] as const) {
      const decision = run(name, input);
      assert.equal(decision.outcome, "deny", `${host}:${name}`);
      assert.match(decision.reason, /mode=research/);
      assert.match(decision.next ?? "", /Read-only alternative.*ordinary/s);
    }
    assert.equal(store.read("task"), null);
  }
});

test("explicit AYM keeps gate, expiry, binding and path permission enforcement", () => {
  const store = new MemoryCodexPermitStore();
  const contract = runtime();
  const prompt = (text: string) => handleCodexHook({ hook_event_name: "UserPromptSubmit", session_id: "task", prompt: text, observed_at: "2026-09-07T00:00:00Z" }, contract, store);
  const write = (at = "2026-09-07T00:00:01Z", path = "src/a.ts") => handleCodexHook({ hook_event_name: "PreToolUse", session_id: "task", tool_name: "apply_patch", tool_input: { path }, observed_at: at }, contract, store).decision!;
  prompt("使用 AYM 修复这个功能");
  assert.equal(write().reasonCode, "PRE_START_HARD_LOCK");
  contract.review.result = "PRE_LOOP_REVIEW_FAILED";
  assert.throws(() => prompt("$major-loop-runner start candidate=v1"), /review did not pass/);
  contract.review.result = "PRE_LOOP_REVIEW_PASSED";
  prompt("$major-loop-runner start candidate=v1");
  assert.equal(write().outcome, "allow");
  assert.equal(handleCodexHook({ hook_event_name: "PreToolUse", session_id: "task", tool_name: "functions.exec", tool_input: { code: "anything()" }, observed_at: "2026-09-07T00:00:01Z" }, contract, store).decision?.reasonCode, "ACTION_EFFECT_UNPROVEN");
  assert.equal(write("2026-09-07T00:01:00Z").reasonCode, "PERMIT_EXPIRED");
  assert.equal(write("2026-09-07T00:00:01Z", "outside.ts").reasonCode, "PATH_OUTSIDE_CONTRACT");
  contract.projectionIdentity = "p2";
  assert.equal(write().reasonCode, "PERMIT_BINDING_INVALID");
  contract.projectionIdentity = "p1";
  prompt("AYM mode ordinary");
  assert.equal(store.read("task"), null);
  assert.equal(write().reasonCode, "AYM_NOT_ENABLED");
  prompt("AYM mode aym");
  assert.equal(write().reasonCode, "PRE_START_HARD_LOCK");
  assert.equal(store.mode("unrelated"), "ordinary");
});

test("prebuilt prompt and tool hooks enforce research without a contract file", () => {
  const root = mkdtempSync(join(tmpdir(), "aym-native-modes-"));
  try {
    for (const host of ["codex", "claude"]) {
      const packageRoot = resolve("native", host);
      const run = (input: object) => {
        const result = spawnSync(process.execPath, [join(packageRoot, "hooks", `asyoumeant-${host}.cjs`)], {
          input: JSON.stringify({ session_id: host, cwd: root, ...input }), encoding: "utf8",
          env: { ...process.env, PLUGIN_ROOT: packageRoot, CLAUDE_PLUGIN_ROOT: packageRoot, ASYOUMEANT_CONTRACT_PATH: join(root, "absent.json"), ASYOUMEANT_STATE_DIR: join(root, host), CLAUDE_PLUGIN_DATA: join(root, host) }
        });
        assert.equal(result.status, 0, result.stderr);
        return result.stdout;
      };
      assert.equal(run({ hook_event_name: "PreToolUse", tool_name: "web.run", tool_input: { search_query: [{ q: "docs" }] } }), "");
      run({ hook_event_name: "UserPromptSubmit", prompt: "AYM mode research" });
      assert.equal(run({ hook_event_name: "PreToolUse", tool_name: "read_file", tool_input: { path: "a" } }), "");
      assert.match(run({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "a" } }), /RESEARCH_READ_ONLY/);
      run({ hook_event_name: "UserPromptSubmit", prompt: "AYM mode ordinary" });
      assert.equal(run({ hook_event_name: "PreToolUse", tool_name: "Write" }), "");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("intent recognition requires a direct directive and mode persists without session-name collisions", () => {
  for (const text of ["fix code", "read README", "search official docs", "Explain AYM", "Do not use AYM", "不要使用 AYM", "```text\nUse AYM\n```", "The docs say: use AYM"]) assert.equal(requestedMode(text), null, text);
  for (const text of ["使用 AYM", "使用 pre-loop", "进入 major-loop", "按 AYM 合同开发", "Use AsYouMeant to prepare pre-loop"]) assert.equal(requestedMode(text), "aym");
  const directory = mkdtempSync(join(tmpdir(), "aym-session-"));
  try {
    const store = new FileSessionStore(directory);
    store.setMode("a/b", "research");
    const reloaded = new FileSessionStore(directory);
    assert.equal(reloaded.mode("a/b"), "research");
    assert.equal(reloaded.mode("a_b"), "ordinary");
    reloaded.setMode("a/b", "ordinary");
    assert.equal(store.mode("a/b"), "ordinary");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("ordinary sessions do not inherit a workspace contract or require permits", () => {
  for (const tool_name of ["web.run", "read_file", "apply_patch"]) {
    const result = handleCodexHook({ hook_event_name: "PreToolUse", session_id: "new", tool_name }, runtime(), new MemoryCodexPermitStore());
    assert.notEqual(result.decision?.outcome, "deny", tool_name);
  }
  const result = handleOpenCodeTool({ tool: "websearch", sessionID: "new", callID: "read" }, { args: { query: "official docs" } }, runtime(), new MemoryOpenCodePermitStore());
  assert.equal(result.decision.outcome, "allow");
});
