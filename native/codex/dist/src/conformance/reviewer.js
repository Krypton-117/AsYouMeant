export class ChangeReviewError extends Error {
    issues;
    constructor(issues) {
        const ordered = [...new Set(issues)].sort();
        super(`Change review configuration is invalid:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
        this.name = "ChangeReviewError";
        this.issues = ordered;
    }
}
const dimensions = ["intent", "permission", "technical", "internal"];
export function reviewGate(input) {
    const conflicts = structuredClone(input.conflicts);
    for (const projectionVersion of input.projectionVersions) {
        if (projectionVersion === input.candidateVersion)
            continue;
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
    const result = Object.fromEntries(dimensions.map((dimension) => [
        dimension,
        conflicts.some((conflict) => conflict.dimension === dimension) ? "FAIL" : "PASS"
    ]));
    return {
        candidateVersion: input.candidateVersion,
        status: conflicts.length === 0 ? "PRE_LOOP_REVIEW_PASSED" : "PRE_LOOP_REVIEW_FAILED",
        dimensions: result,
        conflicts
    };
}
export function reviewChange(input) {
    const issues = [];
    if (!input.nodeId.trim())
        issues.push("node id is empty");
    if (input.changedPaths.length === 0)
        issues.push("node-specific change set is empty");
    if (input.changedPaths.some((path) => !path.trim()))
        issues.push("change set contains an empty path");
    for (const axis of ["intent", "technical"]) {
        if (!input.checks.some((check) => check.axis === axis)) {
            issues.push(`${axis} review check is missing`);
        }
    }
    for (const check of input.checks) {
        if (!check.criterionId.trim())
            issues.push(`${check.axis} criterion id is empty`);
        if (!check.expected.trim())
            issues.push(`${check.axis} expected result is empty`);
        if (!check.observed.trim())
            issues.push(`${check.axis} observation is empty`);
        if (!check.evidence.trim())
            issues.push(`${check.axis} evidence is empty`);
    }
    if (issues.length > 0)
        throw new ChangeReviewError(issues);
    const changedPaths = [...new Set(input.changedPaths)].sort();
    const deviations = input.checks
        .filter((check) => !check.satisfied)
        .map((check) => ({
        ...structuredClone(check),
        nodeId: input.nodeId,
        changedPaths: [...changedPaths]
    }))
        .sort((left, right) => `${left.axis}:${left.criterionId}`.localeCompare(`${right.axis}:${right.criterionId}`));
    const dimensions = Object.fromEntries(["intent", "technical"].map((axis) => [
        axis,
        deviations.some((deviation) => deviation.axis === axis) ? "FAIL" : "PASS"
    ]));
    return {
        nodeId: input.nodeId,
        status: deviations.length === 0 ? "PASS" : "FAIL",
        dimensions,
        deviations
    };
}
// SPDX-License-Identifier: MPL-2.0
