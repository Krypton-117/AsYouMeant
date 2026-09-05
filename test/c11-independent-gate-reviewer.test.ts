import assert from "node:assert/strict";
import test from "node:test";

import { reviewGate, type GateReviewInput } from "../src/index.js";

test("C11 returns a deterministic four-dimension PASS without mutating inputs", () => {
  const input: GateReviewInput = {
    candidateVersion: "2026-09-05.1",
    projectionVersions: ["2026-09-05.1", "2026-09-05.1"],
    conflicts: []
  };
  const before = structuredClone(input);
  const first = reviewGate(input);
  const second = reviewGate(input);
  assert.deepEqual(input, before);
  assert.deepEqual(first, second);
  assert.equal(first.status, "PRE_LOOP_REVIEW_PASSED");
  assert.deepEqual(first.dimensions, {
    intent: "PASS",
    permission: "PASS",
    technical: "PASS",
    internal: "PASS"
  });
});

test("C11 fails precisely when one projection belongs to an old candidate", () => {
  const result = reviewGate({
    candidateVersion: "2026-09-05.1",
    projectionVersions: ["2026-09-04.30"],
    conflicts: []
  });
  assert.equal(result.status, "PRE_LOOP_REVIEW_FAILED");
  assert.equal(result.dimensions.internal, "FAIL");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0]?.responsibleParty, "Agent");
  assert.equal(result.conflicts[0]?.minimalCorrection, "Regenerate only the stale projection.");
});
