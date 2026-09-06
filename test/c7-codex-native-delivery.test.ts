import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  CODEX_APP_VERSION,
  CODEX_CLI_VERSION,
  MemoryCodexPermitStore,
  handleCodexHook,
  installCodexPlugin,
  selfcheckCodexPlugin,
  uninstallCodexPlugin,
  type CodexHookInput,
  type CodexLifecycleOptions,
  type CodexRuntimeContract
} from "../src/index.js";

const candidateVersion = "2026-09-04.30";
const projectionIdentity = "bootstrap-2026-09-04.30/C7/3";
const startCommand = `$major-loop-runner start candidate=${candidateVersion}`;
const repositoryRoot = resolve(".");
const qaRoot = join(repositoryRoot, ".work", "qa", `bootstrap-${candidateVersion}`);
const codexRoot = join(qaRoot, "codex");
const isolatedHome = join(codexRoot, "profile-c7-3");
const pluginPackageRoot = join(repositoryRoot, "native", "codex");

function contract(): CodexRuntimeContract {
  return {
    candidateVersion,
    projectionIdentity,
    review: { result: "PRE_LOOP_REVIEW_PASSED", candidateVersion, projectionIdentity },
    nativeStartPaths: [{ host: "codex", sourceKind: "codex-user-prompt-submit", command: startCommand }],
    policy: {
      taskMode: "change",
      controlLevel: "hard-lock",
      executionState: "active",
      allowedWorkItemIds: ["C7"],
      allowedPaths: ["src/**", "test/**", ".work/**"],
      dependencyPolicy: "allow",
      allowedDependencies: ["ajv", "typescript", "@types/node", "@opencode-ai/plugin"],
      hashPolicy: "deny",
      allowedHashConsumerIds: [],
      agentBudget: 0,
      agentsUsed: 0,
      allowedTestIds: ["C7-acceptance"],
      retryBudget: 1,
      allowedNetworkTargets: [],
      allowedExternalWriteTargets: [],
      deliveryAllowed: false
    },
    activeWorkItemId: "C7",
    actionBasis: { kind: "requested", requirementIds: ["R7"] },
    permitDurationMs: 3_600_000
  };
}

function prompt(session: string, text: string, event = "UserPromptSubmit"): CodexHookInput {
  return {
    hook_event_name: event,
    session_id: session,
    turn_id: "turn-1",
    prompt: text,
    cwd: repositoryRoot,
    observed_at: "2026-09-05T03:00:00+08:00"
  };
}

function preTool(session: string, toolName = "apply_patch"): CodexHookInput {
  return {
    hook_event_name: "PreToolUse",
    session_id: session,
    turn_id: "turn-2",
    tool_use_id: `${session}-tool`,
    tool_name: toolName,
    tool_input: toolName === "apply_patch"
      ? { patch: "*** Begin Patch\n*** Update File: src/index.ts\n*** End Patch" }
      : { path: "src/index.ts" },
    cwd: repositoryRoot,
    observed_at: "2026-09-05T03:01:00+08:00"
  };
}

test("C7 recognizes only the exact Codex UserPromptSubmit source", () => {
  const store = new MemoryCodexPermitStore();
  const runtimeContract = contract();
  assert.equal(handleCodexHook(prompt("approx", "please start"), runtimeContract, store).sourceRecognized, false);
  assert.equal(store.read("approx"), null);

  const wrong = handleCodexHook(prompt("wrong", startCommand, "SessionStart"), runtimeContract, store);
  assert.equal(wrong.sourceRecognized, false);
  assert.equal(store.read("wrong"), null);
  assert.equal(handleCodexHook(preTool("wrong"), runtimeContract, store).decision?.reasonCode, "PRE_START_HARD_LOCK");

  const started = handleCodexHook(prompt("legal", startCommand), runtimeContract, store);
  assert.equal(started.sourceRecognized, true);
  assert.equal(started.permit?.nativeStart.sourceKind, "codex-user-prompt-submit");
  assert.equal(handleCodexHook(preTool("legal", "read_file"), runtimeContract, store).decision?.outcome, "allow");
});

test("C7 reports pre-start denial without claiming a host effect", () => {
  const result = handleCodexHook(preTool("locked"), contract(), new MemoryCodexPermitStore());
  assert.equal(result.output?.hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.output?.hookSpecificOutput.permissionDecisionReason ?? "", /PRE_START_HARD_LOCK/);
  assert.deepEqual(result.decision?.hostEffect, { outcome: "unobserved", evidenceId: null });
});

test("C7 package binds the native manifest and explicit-only start Skill", () => {
  assert.equal(CODEX_CLI_VERSION, "0.144.3");
  assert.equal(CODEX_APP_VERSION, "26.825.6671.0");
  const manifest = JSON.parse(readFileSync(join(pluginPackageRoot, ".codex-plugin", "plugin.json"), "utf8")) as {
    name: string; version: string; hooks?: string;
  };
  assert.deepEqual({ name: manifest.name, version: manifest.version, hooks: manifest.hooks }, {
    name: "asyoumeant", version: "0.3.0", hooks: "./hooks/codex-hooks.json"
  });
  const policy = readFileSync(join(pluginPackageRoot, "skills", "major-loop-runner", "agents", "openai.yaml"), "utf8");
  assert.match(policy, /allow_implicit_invocation:\s*false/);
});

test("C7 completes one isolated real Codex lifecycle and hook chain", () => {
  mkdirSync(codexRoot, { recursive: true });
  const options: CodexLifecycleOptions = {
    command: {
      executable: "D:\\ProgramFile\\node\\node.exe",
      prefixArgs: ["C:\\Users\\Lenovo\\AppData\\Local\\npm\\node_modules\\@openai\\codex\\bin\\codex.js"]
    },
    isolatedHome,
    allowedQaRoot: qaRoot,
    marketplaceRoot: repositoryRoot,
    pluginPackageRoot,
    marketplaceName: "asyoumeant",
    pluginName: "asyoumeant"
  };
  const contractPath = join(codexRoot, "contract.json");
  const stateRoot = join(codexRoot, "state");
  writeFileSync(contractPath, `${JSON.stringify(contract(), null, 2)}\n`, "utf8");

  let installed = false;
  try {
    installCodexPlugin(options);
    installed = true;
    const selfcheck = selfcheckCodexPlugin(options);
    const invoke = (input: CodexHookInput) => spawnSync(
      process.execPath,
      [join(selfcheck.installedPluginRoot, "hooks", "asyoumeant-codex.cjs")],
      {
        input: `${JSON.stringify(input)}\n`,
        encoding: "utf8",
        env: {
          ...process.env,
          PLUGIN_ROOT: selfcheck.installedPluginRoot,
          CODEX_HOME: isolatedHome,
          ASYOUMEANT_CONTRACT_PATH: contractPath,
          ASYOUMEANT_STATE_DIR: stateRoot
        }
      }
    );

    const denied = invoke(preTool("real-pre-start"));
    assert.equal(denied.status, 0, denied.stderr);
    assert.match(denied.stdout, /PRE_START_HARD_LOCK/);

    const started = invoke(prompt("real-legal", startCommand));
    assert.equal(started.status, 0, started.stderr);
    assert.match(started.stdout, /permit ACTIVE/);
    const allowed = invoke(preTool("real-legal", "read_file"));
    assert.equal(allowed.status, 0, allowed.stderr);
    assert.equal(allowed.stdout, "");

    const wrongSource = invoke(prompt("real-wrong-source", startCommand, "SessionStart"));
    assert.equal(wrongSource.status, 0, wrongSource.stderr);
    assert.equal(wrongSource.stdout, "");
    assert.match(invoke(preTool("real-wrong-source")).stdout, /PRE_START_HARD_LOCK/);

    writeFileSync(join(codexRoot, "visible-result.json"), `${JSON.stringify({
      host: `Codex App ${CODEX_APP_VERSION} / CLI ${CODEX_CLI_VERSION}`,
      install: "passed",
      explicitStart: "codex-user-prompt-submit",
      preStart: "denied",
      legalChain: "allowed",
      selfcheck: "passed",
      hostEffect: "unobserved"
    }, null, 2)}\n`, "utf8");
  } finally {
    if (installed) uninstallCodexPlugin(options);
  }

  const after = spawnSync(options.command.executable, [...options.command.prefixArgs, "plugin", "list", "--json"], {
    encoding: "utf8",
    env: { ...process.env, CODEX_HOME: isolatedHome }
  });
  assert.equal(after.status, 0, after.stderr);
  assert.doesNotMatch(after.stdout.toLowerCase(), /asyoumeant/);
});
// SPDX-License-Identifier: MPL-2.0
