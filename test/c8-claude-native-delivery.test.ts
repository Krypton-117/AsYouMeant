import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  CLAUDE_CODE_VERSION,
  CLAUDE_CONTRACT_SNAPSHOT,
  MemoryClaudePermitStore,
  handleClaudeHook,
  prepareClaudePluginPackage,
  verifyClaudePluginContract,
  type ClaudeHookInput,
  type ClaudeRuntimeContract
} from "../src/index.js";

const candidateVersion = "2026-09-04.30";
const projectionIdentity = "bootstrap-2026-09-04.30/C8/1";
const startArgs = `start candidate=${candidateVersion}`;
const startCommand = `/asyoumeant:major-loop-runner ${startArgs}`;
const repositoryRoot = resolve(".");
const packageRoot = join(repositoryRoot, "native", "claude");
const qaRoot = join(repositoryRoot, ".work", "qa", `bootstrap-${candidateVersion}`, "claude-contract");

function contract(): ClaudeRuntimeContract {
  return {
    candidateVersion,
    projectionIdentity,
    review: { result: "PRE_LOOP_REVIEW_PASSED", candidateVersion, projectionIdentity },
    nativeStartPaths: [{
      host: "claude-code",
      sourceKind: "claude-user-prompt-expansion",
      command: startCommand
    }],
    policy: {
      taskMode: "change",
      controlLevel: "hard-lock",
      executionState: "active",
      allowedWorkItemIds: ["C8"],
      allowedPaths: ["src/**", "test/**", "native/**"],
      dependencyPolicy: "allow",
      allowedDependencies: ["ajv", "typescript", "@types/node", "@opencode-ai/plugin"],
      hashPolicy: "deny",
      allowedHashConsumerIds: [],
      agentBudget: 0,
      agentsUsed: 0,
      allowedTestIds: ["C8-acceptance"],
      retryBudget: 1,
      allowedNetworkTargets: [],
      allowedExternalWriteTargets: [],
      deliveryAllowed: false
    },
    activeWorkItemId: "C8",
    actionBasis: { kind: "requested", requirementIds: ["R7"] },
    permitDurationMs: 3_600_000
  };
}

function expansion(session: string, overrides: Partial<ClaudeHookInput> = {}): ClaudeHookInput {
  return {
    hook_event_name: "UserPromptExpansion",
    session_id: session,
    expansion_type: "slash_command",
    command_name: "asyoumeant:major-loop-runner",
    command_args: startArgs,
    command_source: "plugin",
    prompt: startCommand,
    cwd: repositoryRoot,
    observed_at: "2026-09-05T04:00:00+08:00",
    ...overrides
  };
}

function preTool(session: string, tool = "Write"): ClaudeHookInput {
  return {
    hook_event_name: "PreToolUse",
    session_id: session,
    tool_name: tool,
    tool_use_id: `${session}-tool`,
    tool_input: tool === "Write" ? { file_path: "src/index.ts" } : { file_path: "src/index.ts" },
    observed_at: "2026-09-05T04:01:00+08:00"
  };
}

test("C8 recognizes only the exact namespaced user expansion", () => {
  const store = new MemoryClaudePermitStore();
  const runtime = contract();
  assert.equal(handleClaudeHook(expansion("wrong-source", { command_source: "model" }), runtime, store).sourceRecognized, false);
  assert.equal(handleClaudeHook(expansion("wrong-command", { command_name: "major-loop-runner" }), runtime, store).sourceRecognized, false);
  assert.equal(handleClaudeHook(expansion("wrong-args", { command_args: "start candidate=other" }), runtime, store).sourceRecognized, false);
  const started = handleClaudeHook(expansion("legal"), runtime, store);
  assert.equal(started.sourceRecognized, true);
  assert.equal(started.permit?.nativeStart.sourceKind, "claude-user-prompt-expansion");
  assert.equal(handleClaudeHook(preTool("legal", "Read"), runtime, store).decision?.outcome, "allow");
});

test("C8 preserves the pre-start hard lock through Claude PreToolUse", () => {
  const store = new MemoryClaudePermitStore();
  handleClaudeHook({ hook_event_name: "UserPromptSubmit", session_id: "locked", prompt: "AYM mode aym" }, contract(), store);
  const result = handleClaudeHook(preTool("locked"), contract(), store);
  assert.equal(result.output?.hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.output?.hookSpecificOutput.permissionDecisionReason ?? "", /PRE_START_HARD_LOCK/);
  assert.deepEqual(result.decision?.hostEffect, { outcome: "unobserved", evidenceId: null });
});

test("C8 package matches the frozen official contract and accurate evidence label", () => {
  prepareClaudePluginPackage(repositoryRoot, packageRoot);
  const result = verifyClaudePluginContract(packageRoot);
  assert.equal(result.hostVersion, "2.1.260");
  assert.equal(result.contractSnapshot, "2026-09-06");
  assert.equal(result.label, "contract-verified-not-real-host-tested");
  assert.equal(result.realHostTested, false);
  assert.equal(result.installCommand, "claude plugin install asyoumeant@asyoumeant --scope user");
  assert.equal(result.uninstallCommand, "claude plugin uninstall asyoumeant@asyoumeant --scope user");

  const evidence = JSON.parse(readFileSync(join(packageRoot, "CONTRACT-EVIDENCE.json"), "utf8")) as {
    hostPackage: string; mode: string; sources: string[];
  };
  assert.equal(evidence.hostPackage, `@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}`);
  assert.equal(evidence.mode, "contract-verified-not-real-host-tested");
  assert.equal(evidence.sources.length, 4);
  assert.equal(CLAUDE_CONTRACT_SNAPSHOT, "2026-09-06");
});

test("C8 prebuilt hook uses the contract adapter without starting Claude Code", () => {
  mkdirSync(qaRoot, { recursive: true });
  prepareClaudePluginPackage(repositoryRoot, packageRoot);
  const contractPath = join(qaRoot, "contract.json");
  writeFileSync(contractPath, `${JSON.stringify(contract(), null, 2)}\n`, "utf8");
  const run = (input: ClaudeHookInput) => spawnSync(process.execPath, [join(packageRoot, "hooks", "asyoumeant-claude.cjs")], {
    input: `${JSON.stringify(input)}\n`,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: packageRoot,
      CLAUDE_PLUGIN_DATA: join(qaRoot, "data"),
      ASYOUMEANT_CONTRACT_PATH: contractPath
    }
  });

  run({ hook_event_name: "UserPromptSubmit", session_id: "wire-locked", prompt: "AYM mode aym" });
  const denied = run(preTool("wire-locked"));
  assert.equal(denied.status, 0, denied.stderr);
  assert.match(denied.stdout, /PRE_START_HARD_LOCK/);
  const ordinary = run({ ...expansion("wire-ordinary"), hook_event_name: "UserPromptSubmit" });
  assert.equal(ordinary.stdout, "");
  const started = run(expansion("wire-legal"));
  assert.match(started.stdout, /permit ACTIVE/);
  assert.equal(run(preTool("wire-legal", "Read")).stdout, "");
});
// SPDX-License-Identifier: MPL-2.0
