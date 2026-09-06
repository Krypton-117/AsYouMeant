// SPDX-License-Identifier: MPL-2.0

import type { AcceptanceStrategy } from "../contracts/types.js";

export interface TestFirstStepEvidence {
  testId: string;
  seam: string;
  seamKind: "public" | "stable-internal" | "private-implementation";
  sequence: number;
  result: "passed" | "failed";
  observation: string;
  cause: "missing-behavior" | "unrelated-failure" | "implemented-behavior";
}
export interface TestFirstEvidenceInput {
  nodeId: string;
  strategy: AcceptanceStrategy;
  red?: TestFirstStepEvidence;
  green?: TestFirstStepEvidence;
}

export interface TestFirstEvidenceResult {
  nodeId: string;
  required: boolean;
  status: "NOT_APPLICABLE" | "ACCEPTED" | "REJECTED";
  issues: string[];
}

export function assessTestFirstEvidence(
  input: Readonly<TestFirstEvidenceInput>
): TestFirstEvidenceResult {
  if (input.strategy !== "test-first") {
    return { nodeId: input.nodeId, required: false, status: "NOT_APPLICABLE", issues: [] };
  }

  const issues: string[] = [];
  if (!input.nodeId.trim()) issues.push("node id is empty");
  if (!input.red) issues.push("red evidence is missing");
  if (!input.green) issues.push("green evidence is missing");
  if (input.red) {
    if (input.red.result !== "failed") issues.push("red evidence did not fail");
    if (input.red.cause !== "missing-behavior") issues.push("red failure was not caused by missing behavior");
    if (input.red.seamKind === "private-implementation") issues.push("red evidence uses a private implementation seam");
    if (!input.red.observation.trim()) issues.push("red observation is empty");
  }
  if (input.green) {
    if (input.green.result !== "passed") issues.push("green evidence did not pass");
    if (input.green.seamKind === "private-implementation") issues.push("green evidence uses a private implementation seam");
    if (!input.green.observation.trim()) issues.push("green observation is empty");
  }
  if (input.red && input.green) {
    if (input.red.testId !== input.green.testId) issues.push("red and green use different test identities");
    if (input.red.seam !== input.green.seam) issues.push("red and green use different seams");
    if (input.red.sequence >= input.green.sequence) issues.push("red evidence does not precede green evidence");
  }
  const ordered = [...new Set(issues)].sort();
  return {
    nodeId: input.nodeId,
    required: true,
    status: ordered.length === 0 ? "ACCEPTED" : "REJECTED",
    issues: ordered
  };
}
