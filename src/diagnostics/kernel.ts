import type { LedgerEvidenceView } from "../state/types.js";
import type {
  DiagnosticBudget,
  DiagnosticCatalog,
  DiagnosticHistoryEntry,
  DiagnosticHypothesis,
  DiagnosticKernelDependencies,
  DiagnosticOutcome,
  DiagnosticProbe,
  ProbeResult,
  ProvenFix
} from "./types.js";

export class DiagnosticKernelError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`Diagnostic kernel configuration is invalid:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "DiagnosticKernelError";
    this.issues = ordered;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function duplicates(values: readonly string[], label: string): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].map((value) => `${label} is duplicated: ${value}`);
}

function validateCatalog(catalog: DiagnosticCatalog): void {
  const issues = [
    ...duplicates(catalog.failures.map((failure) => failure.id), "failure evidence id"),
    ...duplicates(catalog.hypotheses.map((hypothesis) => hypothesis.id), "hypothesis id"),
    ...duplicates(catalog.probes.map((probe) => probe.id), "probe id"),
    ...duplicates(
      catalog.history.map((entry) => `${entry.failureEvidenceId}:${entry.probeId}`),
      "diagnostic history path"
    )
  ];
  const failures = new Map(catalog.failures.map((failure) => [failure.id, failure]));
  const hypotheses = new Map(catalog.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  const probes = new Map(catalog.probes.map((probe) => [probe.id, probe]));

  for (const hypothesis of catalog.hypotheses) {
    if (!isNonEmpty(hypothesis.id)) issues.push("hypothesis id is empty");
    if (!failures.has(hypothesis.failureEvidenceId)) {
      issues.push(`hypothesis ${hypothesis.id} references unknown failure ${hypothesis.failureEvidenceId}`);
    }
    if (!isNonEmpty(hypothesis.statement)) issues.push(`hypothesis ${hypothesis.id} has no statement`);
    if (!isNonEmpty(hypothesis.defect.defectId)) issues.push(`hypothesis ${hypothesis.id} has no defect id`);
    if (!isNonEmpty(hypothesis.defect.description)) {
      issues.push(`hypothesis ${hypothesis.id} has no defect description`);
    }
    if (!isNonEmpty(hypothesis.defect.workItemId)) {
      issues.push(`hypothesis ${hypothesis.id} has no fix work item`);
    }
    if (
      hypothesis.defect.allowedTargetPaths.length === 0 ||
      hypothesis.defect.allowedTargetPaths.some((path) => !isNonEmpty(path))
    ) {
      issues.push(`hypothesis ${hypothesis.id} has no bounded fix target`);
    }
  }

  for (const probe of catalog.probes) {
    if (!isNonEmpty(probe.id)) issues.push("probe id is empty");
    if (!failures.has(probe.failureEvidenceId)) {
      issues.push(`probe ${probe.id} references unknown failure ${probe.failureEvidenceId}`);
    }
    if (!Number.isFinite(probe.cost) || probe.cost <= 0) {
      issues.push(`probe ${probe.id} cost must be positive`);
    }
    issues.push(...duplicates(probe.predictions.map((prediction) => prediction.hypothesisId), `probe ${probe.id} prediction`));
    for (const prediction of probe.predictions) {
      const hypothesis = hypotheses.get(prediction.hypothesisId);
      if (!hypothesis || hypothesis.failureEvidenceId !== probe.failureEvidenceId) {
        issues.push(`probe ${probe.id} prediction references an unrelated hypothesis ${prediction.hypothesisId}`);
      }
      if (!isNonEmpty(prediction.observationKey)) {
        issues.push(`probe ${probe.id} has an empty predicted observation`);
      }
    }
    const test = probe.action.test;
    if (
      probe.action.kind !== "test" ||
      !test ||
      test.classification !== "diagnostic" ||
      test.failureEvidenceId !== probe.failureEvidenceId ||
      !test.discriminating
    ) {
      issues.push(`probe ${probe.id} action is not a bound discriminating diagnostic test`);
    } else {
      const declared = [...test.hypothesisIds].sort();
      const predicted = probe.predictions.map((prediction) => prediction.hypothesisId).sort();
      if (JSON.stringify(declared) !== JSON.stringify(predicted)) {
        issues.push(`probe ${probe.id} Guard hypotheses do not match its predictions`);
      }
    }
  }

  for (const entry of catalog.history) {
    const probe = probes.get(entry.probeId);
    if (!probe || probe.failureEvidenceId !== entry.failureEvidenceId) {
      issues.push(`history references unknown diagnostic path ${entry.failureEvidenceId}:${entry.probeId}`);
    }
    if (entry.result.probeId !== entry.probeId) {
      issues.push(`history result does not match probe ${entry.probeId}`);
    }
    if (entry.cost !== probe?.cost) issues.push(`history cost does not match probe ${entry.probeId}`);
  }
  if (issues.length > 0) throw new DiagnosticKernelError(issues);
}

function stop(
  reasonCode: string,
  reason: string,
  next: string,
  remainingHypothesisIds: string[],
  probeResult: ProbeResult | null = null,
  guardDecision: DiagnosticOutcome["guardDecision"] = null
): DiagnosticOutcome {
  return {
    status: "stopped",
    reasonCode,
    reason,
    next,
    probeResult: probeResult ? clone(probeResult) : null,
    guardDecision: guardDecision ? clone(guardDecision) : null,
    remainingHypothesisIds: [...remainingHypothesisIds].sort(),
    provenFix: null
  };
}

function predictionMap(probe: DiagnosticProbe): Map<string, string> {
  return new Map(probe.predictions.map((prediction) => [prediction.hypothesisId, prediction.observationKey]));
}

function discrimination(probe: DiagnosticProbe, hypothesisIds: readonly string[]): number {
  const predictions = predictionMap(probe);
  if (hypothesisIds.some((id) => !predictions.has(id))) return 0;
  return new Set(hypothesisIds.map((id) => predictions.get(id))).size;
}

function validateBudget(budget: DiagnosticBudget): string | null {
  if (!Number.isInteger(budget.maxProbes) || budget.maxProbes < 0) {
    return "Diagnostic maxProbes must be a non-negative integer.";
  }
  if (!Number.isFinite(budget.maxCost) || budget.maxCost < 0) {
    return "Diagnostic maxCost must be a non-negative number.";
  }
  return null;
}

function validateProbeResult(probe: DiagnosticProbe, result: Omit<ProbeResult, "probeId">): ProbeResult {
  const issues: string[] = [];
  if (!isNonEmpty(result.observationKey)) issues.push(`probe ${probe.id} returned no observation key`);
  if (!isNonEmpty(result.observation)) issues.push(`probe ${probe.id} returned no observation`);
  if (!isNonEmpty(result.occurredAt) || Number.isNaN(Date.parse(result.occurredAt))) {
    issues.push(`probe ${probe.id} returned an invalid occurrence time`);
  }
  if (result.newEvidenceIds.some((id) => !isNonEmpty(id))) {
    issues.push(`probe ${probe.id} returned an empty evidence id`);
  }
  issues.push(...duplicates(result.newEvidenceIds, `probe ${probe.id} evidence id`));
  if (issues.length > 0) throw new DiagnosticKernelError(issues);
  return { probeId: probe.id, ...clone(result) };
}

export class DiagnosticKernel {
  readonly #catalog: DiagnosticCatalog;
  readonly #dependencies: DiagnosticKernelDependencies;
  readonly #remaining = new Map<string, Set<string>>();
  readonly #proven = new Map<string, { hypothesisId: string; proofEvidenceIds: string[] }>();
  #history: DiagnosticHistoryEntry[];

  constructor(catalog: DiagnosticCatalog, dependencies: DiagnosticKernelDependencies) {
    validateCatalog(catalog);
    this.#catalog = clone(catalog);
    this.#dependencies = dependencies;
    this.#history = clone(catalog.history);

    for (const failure of this.#catalog.failures) {
      this.#remaining.set(
        failure.id,
        new Set(
          this.#catalog.hypotheses
            .filter((hypothesis) => hypothesis.failureEvidenceId === failure.id)
            .map((hypothesis) => hypothesis.id)
        )
      );
    }
    for (const entry of this.#history) {
      if (entry.result.newEvidenceIds.length > 0) {
        this.#applyResult(entry.failureEvidenceId, entry.result);
      }
    }
  }

  diagnose(failureEvidenceId: string, budget: DiagnosticBudget): DiagnosticOutcome {
    const failure = this.#catalog.failures.find((candidate) => candidate.id === failureEvidenceId);
    if (!failure || failure.result !== "failed" || !failure.valid) {
      return stop(
        "FAILURE_EVIDENCE_REQUIRED",
        "No valid failed evidence exists for this diagnostic request.",
        "Record a current failure observation before diagnosing.",
        []
      );
    }
    const budgetIssue = validateBudget(budget);
    if (budgetIssue) {
      return stop("DIAGNOSTIC_BUDGET_INVALID", budgetIssue, "Provide a finite non-negative budget.", []);
    }

    const hypotheses = this.#remaining.get(failureEvidenceId) ?? new Set<string>();
    const hypothesisIds = [...hypotheses].sort();
    if (hypothesisIds.length === 0) {
      return stop(
        "HYPOTHESES_REQUIRED",
        "No unresolved evidence-bound hypotheses exist for this failure.",
        "State the minimum competing hypotheses before running a probe.",
        []
      );
    }
    if (this.#proven.has(failureEvidenceId)) {
      return stop(
        "ROOT_CAUSE_ALREADY_PROVEN",
        "A root cause is already proven; another diagnostic probe has no consumer.",
        "Use only the proven defect fix scope.",
        hypothesisIds
      );
    }

    const failureHistory = this.#history.filter((entry) => entry.failureEvidenceId === failureEvidenceId);
    if (failureHistory.some((entry) => entry.result.newEvidenceIds.length === 0)) {
      return stop(
        "NO_NEW_EVIDENCE_PATH_REJECTED",
        "The previous probe on this path produced no new evidence.",
        "Stop the repeated path and report the unresolved hypotheses.",
        hypothesisIds
      );
    }
    const usedCost = failureHistory.reduce((total, entry) => total + entry.cost, 0);
    if (failureHistory.length >= budget.maxProbes || usedCost >= budget.maxCost) {
      return stop(
        "DIAGNOSTIC_BUDGET_EXHAUSTED",
        "The diagnostic probe or cost budget is exhausted.",
        "Stop and report the remaining hypotheses with the current evidence.",
        hypothesisIds
      );
    }

    const usedProbeIds = new Set(failureHistory.map((entry) => entry.probeId));
    const eligible = this.#catalog.probes
      .filter((probe) => probe.failureEvidenceId === failureEvidenceId)
      .filter((probe) => !usedProbeIds.has(probe.id))
      .filter((probe) => probe.cost <= budget.maxCost - usedCost)
      .map((probe) => ({ probe, distinction: discrimination(probe, hypothesisIds) }))
      .filter((candidate) => candidate.distinction >= 2)
      .sort((left, right) => {
        if (left.distinction !== right.distinction) return right.distinction - left.distinction;
        if (left.probe.cost !== right.probe.cost) return left.probe.cost - right.probe.cost;
        return left.probe.id.localeCompare(right.probe.id);
      });
    const selected = eligible[0]?.probe;
    if (!selected) {
      return stop(
        "NO_DISCRIMINATING_PROBE",
        "No unused probe can distinguish the current hypotheses within budget.",
        "Stop and report the unresolved hypotheses instead of probing blindly.",
        hypothesisIds
      );
    }

    const guardDecision = this.#dependencies.authorizeProbe(clone(selected), clone(failure));
    if (guardDecision.outcome !== "allow") {
      return stop(
        "PROBE_NOT_AUTHORIZED",
        `The Guard returned ${guardDecision.outcome} for probe ${selected.id}.`,
        guardDecision.next ?? "Stop until the probe has an explicit mapped permission.",
        hypothesisIds,
        null,
        guardDecision
      );
    }

    const result = validateProbeResult(
      selected,
      this.#dependencies.runProbe(clone(selected), clone(failure))
    );
    const entry: DiagnosticHistoryEntry = {
      failureEvidenceId,
      probeId: selected.id,
      cost: selected.cost,
      result: clone(result)
    };
    this.#history.push(entry);

    if (result.newEvidenceIds.length === 0) {
      return stop(
        "PROBE_PRODUCED_NO_NEW_EVIDENCE",
        `Probe ${selected.id} produced no new evidence.`,
        "Stop this diagnostic path; do not repeat the probe.",
        hypothesisIds,
        result,
        guardDecision
      );
    }

    const matched = this.#applyResult(failureEvidenceId, result);
    if (matched.length === 1) {
      const hypothesis = this.#hypothesis(matched[0]);
      const provenFix = this.#createProvenFix(failure, hypothesis, result.newEvidenceIds);
      this.#proven.set(failureEvidenceId, {
        hypothesisId: hypothesis.id,
        proofEvidenceIds: [...result.newEvidenceIds]
      });
      return {
        status: "root-cause-proven",
        reasonCode: "ROOT_CAUSE_PROVEN",
        reason: `Probe ${selected.id} uniquely supports hypothesis ${hypothesis.id}.`,
        next: "Limit any fix to the proven defect and pass it through the Guard.",
        probeResult: clone(result),
        guardDecision: clone(guardDecision),
        remainingHypothesisIds: [hypothesis.id],
        provenFix
      };
    }
    if (matched.length === 0) {
      return stop(
        "OBSERVATION_OUTSIDE_HYPOTHESES",
        "The new observation matches none of the stated hypotheses.",
        "Stop and reformulate hypotheses from the new evidence before another probe.",
        [],
        result,
        guardDecision
      );
    }
    return {
      status: "probe-completed",
      reasonCode: "NEW_EVIDENCE_NARROWED_HYPOTHESES",
      reason: `Probe ${selected.id} narrowed but did not uniquely prove the root cause.`,
      next: "A later call may choose one new discriminating probe if budget remains.",
      probeResult: clone(result),
      guardDecision: clone(guardDecision),
      remainingHypothesisIds: [...matched].sort(),
      provenFix: null
    };
  }

  fixFor(hypothesisId: string): ProvenFix {
    const hypothesis = this.#hypothesis(hypothesisId);
    const proven = this.#proven.get(hypothesis.failureEvidenceId);
    if (!proven || proven.hypothesisId !== hypothesisId) {
      throw new DiagnosticKernelError([`hypothesis ${hypothesisId} is not a proven defect`]);
    }
    const failure = this.#failure(hypothesis.failureEvidenceId);
    return this.#createProvenFix(failure, hypothesis, proven.proofEvidenceIds);
  }

  history(): DiagnosticHistoryEntry[] {
    return clone(this.#history);
  }

  #applyResult(failureEvidenceId: string, result: ProbeResult): string[] {
    const probe = this.#catalog.probes.find((candidate) => candidate.id === result.probeId);
    if (!probe) return [];
    const remaining = this.#remaining.get(failureEvidenceId) ?? new Set<string>();
    const matched = probe.predictions
      .filter(
        (prediction) =>
          remaining.has(prediction.hypothesisId) && prediction.observationKey === result.observationKey
      )
      .map((prediction) => prediction.hypothesisId)
      .sort();
    this.#remaining.set(failureEvidenceId, new Set(matched));
    if (matched.length === 1 && result.newEvidenceIds.length > 0) {
      this.#proven.set(failureEvidenceId, {
        hypothesisId: matched[0] ?? "",
        proofEvidenceIds: [...result.newEvidenceIds]
      });
    }
    return matched;
  }

  #hypothesis(hypothesisId: string | undefined): DiagnosticHypothesis {
    const hypothesis = this.#catalog.hypotheses.find((candidate) => candidate.id === hypothesisId);
    if (!hypothesis) throw new DiagnosticKernelError([`unknown hypothesis: ${hypothesisId ?? "none"}`]);
    return hypothesis;
  }

  #failure(failureEvidenceId: string): LedgerEvidenceView {
    const failure = this.#catalog.failures.find((candidate) => candidate.id === failureEvidenceId);
    if (!failure) throw new DiagnosticKernelError([`unknown failure evidence: ${failureEvidenceId}`]);
    return failure;
  }

  #createProvenFix(
    failure: LedgerEvidenceView,
    hypothesis: DiagnosticHypothesis,
    proofEvidenceIds: string[]
  ): ProvenFix {
    return {
      kind: "proven-defect-fix",
      failureEvidenceId: failure.id,
      hypothesisId: hypothesis.id,
      proofEvidenceIds: [...proofEvidenceIds].sort(),
      defect: clone(hypothesis.defect)
    };
  }
}
