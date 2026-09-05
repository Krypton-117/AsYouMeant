import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  MemoryOpenCodePermitStore,
  OPENCODE_START_SOURCE,
  OPENCODE_VERSION,
  handleOpenCodeCommand,
  handleOpenCodeTool,
  installOpenCodePlugin,
  readOpenCodeContractEvidence,
  selfcheckOpenCodePlugin,
  uninstallOpenCodePlugin,
  type OpenCodeLifecycleOptions,
  type OpenCodeRuntimeContract
} from "../src/index.js";

const candidateVersion = "2026-09-04.30";
const projectionIdentity = "bootstrap-2026-09-04.30/C9/3";
const commandName = "asyoumeant-start";
const commandArguments = `candidate=${candidateVersion}`;
const startCommand = `/${commandName} ${commandArguments}`;
const repositoryRoot = resolve(".");
const packageRoot = join(repositoryRoot, "native", "opencode");
const qaRoot = join(repositoryRoot, ".work", "qa", `bootstrap-${candidateVersion}`);
const isolatedRoot = join(qaRoot, "opencode");
const workspaceRoot = join(isolatedRoot, "workspace");

function contract(): OpenCodeRuntimeContract {
  return {
    candidateVersion,
    projectionIdentity,
    review: { result: "PRE_LOOP_REVIEW_PASSED", candidateVersion, projectionIdentity },
    nativeStartPaths: [{ host: "opencode", sourceKind: OPENCODE_START_SOURCE, command: startCommand }],
    policy: {
      taskMode: "change",
      controlLevel: "hard-lock",
      executionState: "active",
      allowedWorkItemIds: ["C9"],
      allowedPaths: ["src/**", "test/**", "native/**", ".work/**"],
      dependencyPolicy: "allow",
      allowedDependencies: ["ajv", "typescript", "@types/node", "@opencode-ai/plugin"],
      hashPolicy: "deny",
      allowedHashConsumerIds: [],
      agentBudget: 0,
      agentsUsed: 0,
      allowedTestIds: ["C9-acceptance"],
      retryBudget: 1,
      allowedNetworkTargets: [],
      allowedExternalWriteTargets: [],
      deliveryAllowed: false
    },
    activeWorkItemId: "C9",
    actionBasis: { kind: "requested", requirementIds: ["R7"] },
    permitDurationMs: 3_600_000
  };
}

function command(sessionID: string, overrides: Partial<{ command: string; arguments: string }> = {}) {
  return {
    command: commandName,
    sessionID,
    arguments: commandArguments,
    observedAt: "2026-09-05T12:40:00+08:00",
    ...overrides
  };
}

function tool(sessionID: string, name = "read") {
  return {
    input: { tool: name, sessionID, callID: `${sessionID}-tool`, observedAt: "2026-09-05T12:41:00+08:00" },
    output: { args: { path: "src/index.ts" } }
  };
}

function options(): OpenCodeLifecycleOptions {
  return {
    executable: "D:\\Program Files\\Opencode\\node_modules\\opencode-windows-x64-baseline\\bin\\opencode.exe",
    repositoryRoot,
    packageRoot,
    workspaceRoot,
    isolatedRoot,
    allowedQaRoot: qaRoot
  };
}

test("C9 recognizes only the exact native OpenCode command event", () => {
  const store = new MemoryOpenCodePermitStore();
  const runtime = contract();
  assert.equal(handleOpenCodeCommand(command("wrong-name", { command: "major-loop-runner" }), runtime, store).sourceRecognized, false);
  assert.equal(handleOpenCodeCommand(command("wrong-args", { arguments: "candidate=other" }), runtime, store).sourceRecognized, false);
  assert.equal(store.read("wrong-name"), null);
  assert.equal(store.read("wrong-args"), null);

  const started = handleOpenCodeCommand(command("legal"), runtime, store);
  assert.equal(started.sourceRecognized, true);
  assert.equal(started.permit?.nativeStart.command, startCommand);
  assert.equal(started.permit?.nativeStart.sourceKind, "opencode-command-transform");
  const read = tool("legal");
  assert.equal(handleOpenCodeTool(read.input, read.output, runtime, store).decision.outcome, "allow");
});

test("C9 preserves the pre-start hard lock without claiming host enforcement", () => {
  const store = new MemoryOpenCodePermitStore();
  const invocation = tool("locked", "write");
  const result = handleOpenCodeTool(invocation.input, invocation.output, contract(), store);
  assert.equal(result.decision.reasonCode, "PRE_START_HARD_LOCK");
  assert.equal(result.decision.outcome, "deny");
  assert.deepEqual(result.decision.hostEffect, { outcome: "unobserved", evidenceId: null });
});

test("C9 package records the frozen native API mapping", () => {
  assert.equal(OPENCODE_VERSION, "1.18.18");
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as Record<string, unknown>;
  assert.deepEqual(manifest, {
    name: "asyoumeant-opencode",
    version: "0.1.0",
    type: "module",
    private: true,
    license: "MPL-2.0",
    exports: "./asyoumeant.js",
    engines: { opencode: "1.18.18" }
  });
  const evidence = readOpenCodeContractEvidence(packageRoot);
  assert.equal(evidence.registration, "config.command");
  assert.equal(evidence.sourceRecognition, "command.execute.before");
  assert.equal(evidence.guard, "tool.execute.before");
});

test("C9 completes one isolated real OpenCode lifecycle and native chain", async () => {
  mkdirSync(join(workspaceRoot, ".asyoumeant"), { recursive: true });
  writeFileSync(join(workspaceRoot, ".asyoumeant", "contract.json"), `${JSON.stringify(contract(), null, 2)}\n`, "utf8");
  const lifecycle = options();
  let installed = false;
  const savedContract = process.env.ASYOUMEANT_CONTRACT_PATH;
  const savedState = process.env.ASYOUMEANT_STATE_DIR;
  let visibleResult: Record<string, string> | null = null;
  try {
    const installedPluginPath = installOpenCodePlugin(lifecycle);
    installed = true;
    const selfcheck = await selfcheckOpenCodePlugin(lifecycle);
    assert.equal(selfcheck.cliVersion, OPENCODE_VERSION);
    assert.equal(selfcheck.installedPluginPath, installedPluginPath);
    assert.equal(selfcheck.commandRegistered, true);

    process.env.ASYOUMEANT_CONTRACT_PATH = join(workspaceRoot, ".asyoumeant", "contract.json");
    process.env.ASYOUMEANT_STATE_DIR = join(isolatedRoot, "runtime-direct");
    const module = await import(`${pathToFileURL(installedPluginPath).href}?c9=${Date.now()}`) as {
      default: (input: { directory: string }) => Promise<Record<string, ((...args: any[]) => Promise<void>) | undefined>>;
    };
    const hooks = await module.default({ directory: workspaceRoot });
    const config: Record<string, unknown> = {};
    const configHook = hooks.config;
    const commandHook = hooks["command.execute.before"];
    const toolHook = hooks["tool.execute.before"];
    assert.ok(configHook);
    assert.ok(commandHook);
    assert.ok(toolHook);
    await configHook(config);
    assert.equal(typeof (config.command as Record<string, unknown>)[commandName], "object");

    const locked = tool("native-locked", "write");
    await assert.rejects(
      toolHook(locked.input, locked.output),
      (error: unknown) => {
        if (!(error instanceof Error) || error.name !== "OpenCodeGuardDenial") return false;
        const decision = (error as Error & { decision?: { reasonCode?: string } }).decision;
        return decision?.reasonCode === "PRE_START_HARD_LOCK";
      }
    );
    await commandHook(command("native-legal"), { parts: [] });
    const legal = tool("native-legal", "read");
    await toolHook(legal.input, legal.output);

    visibleResult = {
      host: `OpenCode ${OPENCODE_VERSION}`,
      install: "passed",
      commandRegistration: "observed-by-host",
      explicitStart: "command.execute.before",
      ordinaryPromptPermit: "unavailable",
      preStart: "denied",
      legalChain: "allowed",
      selfcheck: "passed",
      uninstall: "passed",
      hostEffect: "unobserved"
    };
  } finally {
    if (savedContract === undefined) delete process.env.ASYOUMEANT_CONTRACT_PATH;
    else process.env.ASYOUMEANT_CONTRACT_PATH = savedContract;
    if (savedState === undefined) delete process.env.ASYOUMEANT_STATE_DIR;
    else process.env.ASYOUMEANT_STATE_DIR = savedState;
    if (installed) uninstallOpenCodePlugin(lifecycle);
  }
  assert.ok(visibleResult);
  writeFileSync(join(isolatedRoot, "visible-result.json"), `${JSON.stringify(visibleResult, null, 2)}\n`, "utf8");
  assert.equal(existsSync(join(workspaceRoot, ".opencode", "plugins", "asyoumeant.js")), false);
  assert.equal(existsSync(join(workspaceRoot, ".opencode", "asyoumeant-runtime")), false);
});
