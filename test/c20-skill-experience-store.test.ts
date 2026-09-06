// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  SkillExperienceStore,
  type SkillEvaluation
} from "../src/index.js";

const evaluation = (overrides: Partial<SkillEvaluation> = {}): SkillEvaluation => ({
  skillId: "codebase-design",
  used: true,
  evidence: ["C16 architecture boundary accepted"],
  taskTypes: ["component architecture"],
  impact: ["made the component seam explicit"],
  fits: ["bounded architecture decisions"],
  misfits: ["tasks without an architecture consumer"],
  improvements: ["surface the affected module earlier"],
  comparisons: [{
    skillId: "domain-modeling",
    difference: "focuses on code seams rather than domain language",
    mergeCandidate: false
  }],
  ...overrides
});
test("C20 persists one advisory Markdown document and a new store reads it", async () => {
  const root = await mkdtemp(join(tmpdir(), "asyoumeant-c20-"));
  const path = join(root, "skill-experience.md");
  const first = new SkillExperienceStore(path);

  const updated = await first.update([evaluation()]);
  assert.equal(updated.changed, true);
  const raw = await readFile(path, "utf8");
  assert.match(raw, /^# AsYouMeant Skill Experience/m);
  assert.match(raw, /"authority": "advisory-only"/);

  const restored = await new SkillExperienceStore(path).read();
  assert.equal(restored.authority, "advisory-only");
  assert.equal(restored.skills[0]?.skillId, "codebase-design");
  assert.deepEqual(restored.skills[0]?.taskTypes, ["component architecture"]);
});

test("C20 writes again only when new evidence changes an evaluation conclusion", async () => {
  const root = await mkdtemp(join(tmpdir(), "asyoumeant-c20-change-"));
  const path = join(root, "skill-experience.md");
  const store = new SkillExperienceStore(path);
  await store.update([evaluation()]);
  const before = await readFile(path, "utf8");

  const evidenceOnly = await store.update([evaluation({
    evidence: ["another run with the same conclusions"]
  })]);
  assert.equal(evidenceOnly.changed, false);
  assert.equal(await readFile(path, "utf8"), before);

  const changed = await store.update([evaluation({
    evidence: ["C17 showed a new fit"],
    fits: ["bounded architecture decisions", "task-local compiler design"]
  })]);
  assert.equal(changed.changed, true);
  assert.deepEqual(changed.document.skills[0]?.evidence, [
    "C16 architecture boundary accepted",
    "C17 showed a new fit"
  ]);
});
