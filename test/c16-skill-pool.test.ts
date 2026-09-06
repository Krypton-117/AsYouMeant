// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import test from "node:test";

import {
  SkillPool,
  SkillPoolError,
  type SkillConsumer,
  type SkillDefinition
} from "../src/index.js";

const existingSkill = (): SkillDefinition => ({
  id: "codebase-design",
  origin: "environment",
  trigger: "Use when a named component needs an architecture boundary.",
  supportedIntents: ["define architecture boundary"],
  capabilities: ["architecture-boundary"],
  allowedActions: ["read"],
  resources: ["repository"],
  inputs: ["architecture request"],
  outputs: ["boundary report"],
  completionCriteria: ["boundary is approved"]
});

const consumer = (overrides: Partial<SkillConsumer> = {}): SkillConsumer => ({
  id: "C16",
  intent: "define architecture boundary",
  requiredCapabilities: ["architecture-boundary"],
  allowedActions: ["read"],
  resources: ["repository"],
  inputs: ["architecture request"],
  outputs: ["boundary report"],
  completionCriteria: ["boundary is approved"],
  ...overrides
});

test("C16 keeps a discovered Skill after its last consumer exits the pool", () => {
  const pool = new SkillPool([existingSkill()]);

  assert.equal(pool.snapshot().entries[0]?.status, "out-of-pool");
  pool.enter("codebase-design", consumer());
  assert.equal(pool.use("codebase-design", "C16").id, "codebase-design");

  assert.deepEqual(pool.exitConsumer("C16"), ["codebase-design"]);
  const retained = pool.snapshot().entries[0];
  assert.equal(retained?.status, "out-of-pool");
  assert.deepEqual(retained?.consumerIds, []);
  assert.equal(retained?.skill.origin, "environment");
});

test("C16 rechecks intent and permissions every time a Skill re-enters", () => {
  const pool = new SkillPool([existingSkill()]);
  pool.enter("codebase-design", consumer());
  pool.exitConsumer("C16");

  assert.throws(
    () => pool.enter("codebase-design", consumer({
      id: "C17",
      intent: "publish a release",
      requiredCapabilities: ["release"],
      allowedActions: ["read"]
    })),
    (error: unknown) => error instanceof SkillPoolError &&
      error.issues.includes("skill codebase-design does not support intent publish a release")
  );
  assert.equal(pool.snapshot().entries[0]?.status, "out-of-pool");
});

test("C16 rejects task-local consumers and actions outside their contract", () => {
  const taskLocal: SkillDefinition = {
    id: "repair-schema-loop",
    origin: "task-local",
    trigger: "Use when repairing the reviewed schema loop.",
    supportedIntents: ["repair schema"],
    capabilities: ["schema-repair"],
    allowedActions: ["read", "write"],
    resources: ["schema-files"],
    inputs: ["failing schema evidence"],
    outputs: ["contract-compliant schema"],
    completionCriteria: ["schema failure is resolved"],
    taskLocal: {
      contractPointer: "candidate-1#C7",
      consumerIds: ["C7"],
      expiry: "last-consumer-closed",
      generationReason: "technology-failure"
    }
  };
  const pool = new SkillPool([taskLocal]);

  assert.throws(
    () => pool.enter("repair-schema-loop", {
      id: "C8",
      intent: "repair schema",
      requiredCapabilities: ["schema-repair"],
      allowedActions: ["read", "write"],
      resources: ["schema-files"],
      inputs: ["failing schema evidence"],
      outputs: ["contract-compliant schema"],
      completionCriteria: ["schema failure is resolved"]
    }),
    /is not a bound consumer/
  );
  assert.throws(
    () => pool.enter("repair-schema-loop", {
      id: "C7",
      intent: "repair schema",
      requiredCapabilities: ["schema-repair"],
      allowedActions: ["read"],
      resources: ["schema-files"],
      inputs: ["failing schema evidence"],
      outputs: ["contract-compliant schema"],
      completionCriteria: ["schema failure is resolved"]
    }),
    /would expand actions beyond consumer C7/
  );
});

test("C16 rejects an existing Skill whose inputs, outputs, or completion do not fit", () => {
  const pool = new SkillPool([{
    ...existingSkill(),
    inputs: ["architecture request"],
    outputs: ["boundary report"],
    completionCriteria: ["boundary is approved"]
  }]);

  assert.throws(
    () => pool.enter("codebase-design", {
      ...consumer(),
      inputs: ["architecture request"],
      outputs: ["implementation plan"],
      completionCriteria: ["plan is executable"]
    }),
    /does not provide output implementation plan/
  );
});
