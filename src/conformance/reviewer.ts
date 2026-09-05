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
// SPDX-License-Identifier: MPL-2.0
