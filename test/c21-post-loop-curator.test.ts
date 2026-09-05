import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  PostLoopCurator,
  SkillExperienceStore,
  SkillPool,
  type SkillDefinition
} from "../src/index.js";

const skill: SkillDefinition = {
  id: "repair-schema-loop",
  origin: "task-local",
  trigger: "Use when repairing the reviewed schema loop.",
  supportedIntents: ["repair schema"],
  capabilities: ["schema-repair"],
  allowedActions: ["read"],
  resources: ["schema-files"],
  inputs: ["schema evidence"],
  outputs: ["repaired schema"],
  completionCriteria: ["C21 closes"],
  taskLocal: {
    contractPointer: "candidate-1#C21",
    consumerIds: ["C21"],
    expiry: "last-consumer-closed",
    generationReason: "technology-failure"
  }
};

test("C21 leaves a readable evaluation and exits closed consumers without deleting Skills", async () => {
  const root = await mkdtemp(join(tmpdir(), "asyoumeant-c21-"));
  const store = new SkillExperienceStore(join(root, "skill-experience.md"));
  const pool = new SkillPool([skill]);
  pool.enter("repair-schema-loop", {
    id: "C21",
    intent: "repair schema",
    requiredCapabilities: ["schema-repair"],
    allowedActions: ["read"],
    resources: ["schema-files"],
    inputs: ["schema evidence"],
    outputs: ["repaired schema"],
    completionCriteria: ["C21 closes"]
  });

  const outcome = await new PostLoopCurator(store, pool).run({
    productStatus: "CLOSED",
    closedConsumerIds: ["C21"],
    evaluations: [{
      skillId: "repair-schema-loop",
      used: true,
      evidence: ["C21 document update completed"],
      taskTypes: ["schema recovery"],
      impact: ["kept recovery within the named contract"],
      fits: ["bounded schema failures"],
      misfits: [],
      improvements: [],
      comparisons: []
    }]
  });

  assert.equal(outcome.status, "UPDATED");
  assert.deepEqual(outcome.exitedSkillIds, ["repair-schema-loop"]);
  assert.equal(pool.snapshot().entries[0]?.status, "out-of-pool");
  assert.equal(pool.snapshot().entries[0]?.skill.id, "repair-schema-loop");
  const restored = await new SkillExperienceStore(store.path).read();
  assert.equal(restored.skills[0]?.skillId, "repair-schema-loop");
  assert.deepEqual(restored.skills[0]?.fits, ["bounded schema failures"]);
});
