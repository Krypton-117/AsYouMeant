import type { GuardAction, GuardDecision } from "../guard/types.js";
import type { LedgerEvidenceView } from "../state/types.js";

export interface DefectFixScope {
  defectId: string;
  description: string;
  workItemId: string;
  allowedTargetPaths: string[];
}

export interface DiagnosticHypothesis {
  id: string;
  failureEvidenceId: string;
  statement: string;
  defect: DefectFixScope;
}

export interface ProbePrediction {
  hypothesisId: string;
  observationKey: string;
}

export interface DiagnosticProbe {
  id: string;
  failureEvidenceId: string;
  cost: number;
  action: GuardAction;
  predictions: ProbePrediction[];
}

export interface ProbeResult {
  probeId: string;
  observationKey: string;
  observation: string;
  newEvidenceIds: string[];
  occurredAt: string;
}

export interface DiagnosticHistoryEntry {
  failureEvidenceId: string;
  probeId: string;
  cost: number;
  result: ProbeResult;
}

export interface DiagnosticCatalog {
  failures: LedgerEvidenceView[];
  hypotheses: DiagnosticHypothesis[];
  probes: DiagnosticProbe[];
  history: DiagnosticHistoryEntry[];
}

export interface DiagnosticBudget {
  maxProbes: number;
  maxCost: number;
}

export interface ProvenFix {
  kind: "proven-defect-fix";
  failureEvidenceId: string;
  hypothesisId: string;
  proofEvidenceIds: string[];
  defect: DefectFixScope;
}

export type DiagnosticOutcome =
  | {
      status: "stopped";
      reasonCode: string;
      reason: string;
      next: string;
      probeResult: ProbeResult | null;
      guardDecision: GuardDecision | null;
      remainingHypothesisIds: string[];
      provenFix: null;
    }
  | {
      status: "probe-completed";
      reasonCode: "NEW_EVIDENCE_NARROWED_HYPOTHESES";
      reason: string;
      next: string;
      probeResult: ProbeResult;
      guardDecision: GuardDecision;
      remainingHypothesisIds: string[];
      provenFix: null;
    }
  | {
      status: "root-cause-proven";
      reasonCode: "ROOT_CAUSE_PROVEN";
      reason: string;
      next: string;
      probeResult: ProbeResult;
      guardDecision: GuardDecision;
      remainingHypothesisIds: string[];
      provenFix: ProvenFix;
    };

export interface DiagnosticKernelDependencies {
  authorizeProbe: (probe: DiagnosticProbe, failure: LedgerEvidenceView) => GuardDecision;
  runProbe: (probe: DiagnosticProbe, failure: LedgerEvidenceView) => Omit<ProbeResult, "probeId">;
}
