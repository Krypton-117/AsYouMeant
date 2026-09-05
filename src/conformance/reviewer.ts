export type GateDimension = "intent" | "permission" | "technical" | "internal";

export interface GateConflict {
  dimension: GateDimension;
  impact: string;
  affectedFunction: string;
  candidateVersion: string;
  expected: string;
  observed: string;
  evidence: string;
  responsibleParty: "Agent" | "User";
  minimalCorrection: string;
  reviewScope: string;
}

export interface GateReviewInput {
  candidateVersion: string;
  projectionVersions: string[];
  conflicts: GateConflict[];
}

export interface GateReviewResult {
  candidateVersion: string;
  status: "PRE_LOOP_REVIEW_PASSED" | "PRE_LOOP_REVIEW_FAILED";
  dimensions: Record<GateDimension, "PASS" | "FAIL">;
  conflicts: GateConflict[];
}

export type ChangeReviewAxis = "intent" | "technical";

export interface ChangeReviewCheck {
  axis: ChangeReviewAxis;
  criterionId: string;
  expected: string;
  observed: string;
  evidence: string;
  satisfied: boolean;
}

export interface ChangeReviewInput {
  nodeId: string;
  changedPaths: string[];
  checks: ChangeReviewCheck[];
}

export interface ChangeDeviation extends ChangeReviewCheck {
  nodeId: string;
  changedPaths: string[];
}

export interface ChangeReviewResult {
  nodeId: string;
  status: "PASS" | "FAIL";
  dimensions: Record<ChangeReviewAxis, "PASS" | "FAIL">;
  deviations: ChangeDeviation[];
}

export class ChangeReviewError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`Change review configuration is invalid:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ChangeReviewError";
    this.issues = ordered;
  }
}

const dimensions: GateDimension[] = ["intent", "permission", "technical", "internal"];

export function reviewGate(input: Readonly<GateReviewInput>): GateReviewResult {
  const conflicts = structuredClone(input.conflicts);
  for (const projectionVersion of input.projectionVersions) {
    if (projectionVersion === input.candidateVersion) continue;
    conflicts.push({
      dimension: "internal",
      impact: "The projection cannot authorize work for this candidate.",
      affectedFunction: "major-loop gate",
      candidateVersion: input.candidateVersion,
      expected: `projection version ${input.candidateVersion}`,
      observed: `projection version ${projectionVersion}`,
      evidence: "candidate and projection version comparison",
      responsibleParty: "Agent",
      minimalCorrection: "Regenerate only the stale projection.",
      reviewScope: "candidate and regenerated projection"
    });
  }
  conflicts.sort((left, right) => {
    const a = `${left.dimension}:${left.affectedFunction}:${left.observed}`;
    const b = `${right.dimension}:${right.affectedFunction}:${right.observed}`;
    return a.localeCompare(b);
  });
  const result = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension,
      conflicts.some((conflict) => conflict.dimension === dimension) ? "FAIL" : "PASS"
    ])
  ) as Record<GateDimension, "PASS" | "FAIL">;
  return {
    candidateVersion: input.candidateVersion,
    status: conflicts.length === 0 ? "PRE_LOOP_REVIEW_PASSED" : "PRE_LOOP_REVIEW_FAILED",
    dimensions: result,
    conflicts
  };
}

export function reviewChange(input: Readonly<ChangeReviewInput>): ChangeReviewResult {
  const issues: string[] = [];
  if (!input.nodeId.trim()) issues.push("node id is empty");
  if (input.changedPaths.length === 0) issues.push("node-specific change set is empty");
  if (input.changedPaths.some((path) => !path.trim())) issues.push("change set contains an empty path");
  for (const axis of ["intent", "technical"] as const) {
    if (!input.checks.some((check) => check.axis === axis)) {
      issues.push(`${axis} review check is missing`);
    }
  }
  for (const check of input.checks) {
    if (!check.criterionId.trim()) issues.push(`${check.axis} criterion id is empty`);
    if (!check.expected.trim()) issues.push(`${check.axis} expected result is empty`);
    if (!check.observed.trim()) issues.push(`${check.axis} observation is empty`);
    if (!check.evidence.trim()) issues.push(`${check.axis} evidence is empty`);
  }
  if (issues.length > 0) throw new ChangeReviewError(issues);

  const changedPaths = [...new Set(input.changedPaths)].sort();
  const deviations = input.checks
    .filter((check) => !check.satisfied)
    .map((check) => ({
      ...structuredClone(check),
      nodeId: input.nodeId,
      changedPaths: [...changedPaths]
    }))
    .sort((left, right) => `${left.axis}:${left.criterionId}`.localeCompare(`${right.axis}:${right.criterionId}`));
  const dimensions = Object.fromEntries(
    (["intent", "technical"] as const).map((axis) => [
      axis,
      deviations.some((deviation) => deviation.axis === axis) ? "FAIL" : "PASS"
    ])
  ) as Record<ChangeReviewAxis, "PASS" | "FAIL">;
  return {
    nodeId: input.nodeId,
    status: deviations.length === 0 ? "PASS" : "FAIL",
    dimensions,
    deviations
  };
}
// SPDX-License-Identifier: MPL-2.0
