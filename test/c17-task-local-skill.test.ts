import assert from "node:assert/strict";
import test from "node:test";

import {
  TaskLocalSkillCompiler,
  TaskLocalSkillError,
  type SkillDefinition,
  type TaskLocalSkillRequest
} from "../src/index.js";

const request = (overrides: Partial<TaskLocalSkillRequest> = {}): TaskLocalSkillRequest => ({
  id: "repair-schema-loop",
  trigger: "Use when the reviewed schema repair repeats across named nodes.",
  intent: "repair schema",
  consumerIds: ["C7", "C9"],
  contractPointer: "candidate-1#R5",
  requiredCapabilities: ["schema-repair"],
  allowedActions: ["read", "write"],
  resources: ["schema-files"],
  inputs: ["failing schema evidence"],
  outputs: ["contract-compliant schema"],
  completionCriteria: ["both named consumers close"],
  generationReason: "reusable-loop",
  ...overrides
});

const reusable: SkillDefinition = {
  id: "existing-schema-repair",
  origin: "environment",
  trigger: "Use when repairing a schema for a named consumer.",
  supportedIntents: ["repair schema"],
  capabilities: ["schema-repair"],
  allowedActions: ["read", "write"],
  resources: ["schema-files"],
  inputs: ["failing schema evidence"],
  outputs: ["contract-compliant schema"],
  completionCriteria: ["both named consumers close"]
};

test("C17 selects a compatible existing Skill before generating one", () => {
  const result = new TaskLocalSkillCompiler().resolve(request(), [reusable]);

  assert.equal(result.kind, "existing");
  assert.equal(result.skill.id, "existing-schema-repair");
});

test("C17 generates one intent-bound Skill only when no existing Skill fits", () => {
  const compiler = new TaskLocalSkillCompiler();
  const result = compiler.resolve(request(), []);

  assert.equal(result.kind, "generated");
  assert.equal(result.skill.origin, "task-local");
  assert.deepEqual(result.skill.taskLocal?.consumerIds, ["C7", "C9"]);
  assert.equal(result.skill.taskLocal?.contractPointer, "candidate-1#R5");
  assert.equal(result.skill.taskLocal?.expiry, "last-consumer-closed");
  assert.deepEqual(result.skill.inputs, ["failing schema evidence"]);
  assert.match(result.markdown, /^---\nname: repair-schema-loop\n/);
  assert.match(result.markdown, /Consumers: `C7`, `C9`/);
  assert.match(result.markdown, /Completion: both named consumers close/);
  assert.doesNotMatch(result.markdown, /publish|deploy|unrelated/i);
});

test("C17 rejects a reusable-loop Skill without multiple named consumers", () => {
  assert.throws(
    () => new TaskLocalSkillCompiler().resolve(request({ consumerIds: ["C7"] }), []),
    (error: unknown) => error instanceof TaskLocalSkillError &&
      error.issues.includes("reusable-loop generation requires at least two named consumers")
  );
});

test("C17 permits a single consumer only for an observed overflow or technology failure", () => {
  const result = new TaskLocalSkillCompiler().resolve(request({
    consumerIds: ["C7"],
    generationReason: "context-overflow"
  }), []);

  assert.equal(result.kind, "generated");
  assert.deepEqual(result.skill.taskLocal?.consumerIds, ["C7"]);
});
