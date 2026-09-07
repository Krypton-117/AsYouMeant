// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import {
  DSH_PACKAGE_NAME,
  DSH_SELFCHECK_TOOL,
  DSH_SKILL_NAME,
  DSH_START_SOURCE,
  DSH_VERSION,
  Guard,
  dshChildEnvironment,
  readDshPackageContract,
  type GuardConfig
} from "../src/index.js";

const candidateVersion = "2026-09-05.2";
const projectionIdentity = "bootstrap-2026-09-05.2/C10/1";
const repositoryRoot = resolve(".");
const packageRoot = join(repositoryRoot, "native", "dsh");
const unitRoot = join(repositoryRoot, ".work", "qa", `bootstrap-${candidateVersion}`, "c10-unit");

test("C10 package is an exact-version native DSH Profile Bundle", () => {
  assert.deepEqual(readDshPackageContract(packageRoot), {
    name: DSH_PACKAGE_NAME,
    version: "0.3.1",
    license: "MPL-2.0",
    patch: "./cordis.patch.yml"
  });
  const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
    engines: { dsh: string };
  };
  assert.equal(manifest.engines.dsh, DSH_VERSION);
  const skill = readFileSync(join(packageRoot, "skills", DSH_SKILL_NAME, "SKILL.md"), "utf8");
  assert.match(skill, /disable-model-invocation: true/);
  assert.match(skill, /user-invocable: true/);
});

test("C10 shared Guard recognizes only the DSH skill-invocation source", () => {
  const command = `/${DSH_SKILL_NAME} start candidate=${candidateVersion}`;
  const config: GuardConfig = {
    candidateVersion,
    projectionIdentity,
    review: { result: "PRE_LOOP_REVIEW_PASSED", candidateVersion, projectionIdentity },
    nativeStartPaths: [{ host: "dsh", sourceKind: DSH_START_SOURCE, command }],
    policy: {
      taskMode: "change",
      controlLevel: "hard-lock",
      executionState: "active",
      allowedWorkItemIds: ["C10"],
      allowedPaths: ["native/dsh/**", ".work/**"],
      dependencyPolicy: "deny",
      allowedDependencies: [],
      hashPolicy: "deny",
      allowedHashConsumerIds: [],
      agentBudget: 0,
      agentsUsed: 0,
      allowedTestIds: ["C10-acceptance"],
      retryBudget: 1,
      allowedNetworkTargets: [],
      allowedExternalWriteTargets: [],
      deliveryAllowed: false
    }
  };
  const permit = new Guard(config).mintPermit({
    permitId: "dsh:c10:1",
    candidateVersion,
    projectionIdentity,
    issuedAt: "2026-09-05T15:00:00+08:00",
    expiresAt: "2026-09-05T16:00:00+08:00",
    nativeStart: {
      host: "dsh",
      sourceKind: DSH_START_SOURCE,
      command,
      actor: "user",
      adapterVerified: true,
      evidenceId: "C10-user-skill-source"
    }
  });
  assert.equal(permit.nativeStart.sourceKind, DSH_START_SOURCE);
});

test("C10 DSH child environment excludes credentials and proxy configuration", () => {
  const environment = dshChildEnvironment(
    { dshHome: "D:\\isolated-dsh", contractPath: "D:\\contract.json" },
    {
      Path: "D:\\tools",
      SystemRoot: "C:\\Windows",
      DEEPSEEK_API_KEY: "blocked",
      TOKEN: "blocked",
      HTTPS_PROXY: "https://proxy.example"
    }
  );
  assert.deepEqual(environment, {
    Path: "D:\\tools",
    SystemRoot: "C:\\Windows",
    DSH_HOME: "D:\\isolated-dsh",
    DSH_PERMISSION_MODE: "read-only",
    ASYOUMEANT_CONTRACT_PATH: "D:\\contract.json",
    npm_config_store_dir: resolve("D:\\isolated-dsh", ".pnpm-store")
  });
});

test("C10 native adapter denies pre-start and allows the exact injected Skill chain", async () => {
  rmSync(unitRoot, { recursive: true, force: true });
  const workspace = join(unitRoot, "workspace");
  const contractDir = join(workspace, ".asyoumeant");
  mkdirSync(contractDir, { recursive: true });
  writeFileSync(join(contractDir, "contract.json"), `${JSON.stringify({
    candidateVersion,
    projectionIdentity,
    review: { result: "PRE_LOOP_REVIEW_PASSED", candidateVersion, projectionIdentity },
    dsh: { allowedTools: [DSH_SELFCHECK_TOOL], permitDurationMs: 3_600_000 }
  }, null, 2)}\n`, "utf8");

  const plugin = await import(`${pathToFileURL(join(packageRoot, "asyoumeant-dsh.js")).href}?c10=${Date.now()}`) as {
    apply: (ctx: Record<string, unknown>) => void;
  };
  const events = new Map<string, { handler: (...args: any[]) => Promise<any>; options?: unknown }>();
  let registeredTool: any;
  let providerFactory: (() => any) | undefined;
  const ctx = {
    skills: { registerProvider(factory: () => any) { providerFactory = factory; } },
    tools: { register(tool: any) { registeredTool = tool; } },
    on(name: string, handler: (...args: any[]) => Promise<any>, options?: unknown) {
      events.set(name, { handler, options });
    }
  };
  plugin.apply(ctx);
  assert.equal(providerFactory?.().list instanceof Function, true);
  assert.equal(registeredTool.name, DSH_SELFCHECK_TOOL);
  assert.deepEqual(events.get("agent/pre-step")?.options, { prepend: true });

  const agent = { session: { header: { cwd: workspace } } };
  const preTool = events.get("tools/pre-execute")?.handler;
  const preStep = events.get("agent/pre-step")?.handler;
  assert.ok(preTool);
  assert.ok(preStep);
  assert.equal((await preTool({ name: "write", agent }, async () => ({ kind: "allow" }))).kind, "allow");
  await preStep({ agent, messages: [{ source: { kind: "user" }, content: [{ type: "text", text: "AYM mode research" }] }] }, async () => ({ kind: "enter", messages: [] }));
  for (const name of ["read", "web_search"]) assert.equal((await preTool({ name, agent }, async () => ({ kind: "allow" }))).kind, "allow");
  for (const name of ["write", "bash", "publish", "skill"]) assert.equal((await preTool({ name, agent }, async () => ({ kind: "allow" }))).kind, "deny");
  await preStep({ agent, messages: [{ source: { kind: "user" }, content: [{ type: "text", text: "AYM mode aym" }] }] }, async () => ({ kind: "enter", messages: [] }));
  const denied = await preTool({ name: DSH_SELFCHECK_TOOL, agent }, async () => ({ kind: "allow" }));
  assert.equal(denied.kind, "deny");
  assert.match(denied.reason, /PRE_START_HARD_LOCK/);

  const command = `/${DSH_SKILL_NAME} start candidate=${candidateVersion}`;
  const direct = { source: { kind: "user" }, content: [{ type: "text", text: `${command}\nCall ${DSH_SELFCHECK_TOOL} once.` }] };
  const injected = { source: { kind: "skill-invocation", name: DSH_SKILL_NAME, form: "instructions" }, content: [] };
  await preStep({ agent, messages: [direct] }, async () => ({ kind: "enter", messages: [direct, injected] }));
  const allowed = await preTool({ name: DSH_SELFCHECK_TOOL, agent }, async () => ({ kind: "allow" }));
  assert.equal(allowed.kind, "allow");
  const result = await registeredTool.execute({}, { agent });
  assert.deepEqual(result, { status: "ACTIVE", candidateVersion, sourceKind: DSH_START_SOURCE });

  rmSync(unitRoot, { recursive: true, force: true });
});
