import type { DiagnosticBudget, DiagnosticOutcome } from "../diagnostics/types.js";
import type { Guard } from "../guard/guard.js";
import type { GuardAction, GuardDecision } from "../guard/types.js";
import type { StateLedger } from "../state/ledger.js";
import type { EvidenceRecord, LedgerActor, NodeStatus } from "../state/types.js";

export interface RunnerBudget {
  normalRuns: number;
  diagnostic: DiagnosticBudget;
  environmentRebuilds: number;
}

export interface RunnerNodeDefinition {
  nodeId: string;
  implementationIdentity: string;
  environmentIdentity: string;
  requiredNodeIds: string[];
  executionAction: GuardAction;
  resumeAction: GuardAction;
  budget: RunnerBudget;
}

export interface RunnerContractProjection {
  candidateVersion: string;
  projectionIdentity: string;
  status: "OPEN" | "CLOSED";
  nodes: RunnerNodeDefinition[];
}

export interface ExecutionAcceptance {
  verdict: "accepted" | "rejected";
  evidenceIds: string[];
  reason: string;
  actor: LedgerActor;
}

export interface NodeExecutionResult {
  outcome: "completed" | "failed" | "paused" | "waiting-user" | "waiting-contract-change";
  evidence: EvidenceRecord[];
  acceptance: ExecutionAcceptance | null;
}

export interface RunnerControlAuthority {
  verified: true;
  authority: "direct-user" | "contract";
  source: string;
}

export interface RunnerDependencies {
  ledger: StateLedger;
  guard: Guard;
  now: () => string;
  executeNode: (node: RunnerNodeDefinition, checkpointId: string) => NodeExecutionResult;
  diagnoseFailure: (failureEvidenceId: string, budget: DiagnosticBudget) => DiagnosticOutcome;
}

export interface RunnerOutcome {
  outcome:
    | "rejected"
    | "closed"
    | "awaiting-acceptance"
    | "failed"
    | "paused"
    | "waiting-user"
    | "waiting-contract-change"
    | "cancelled"
    | "recovered";
  reasonCode: string;
  reason: string;
  nodeId: string;
  nodeStatus: NodeStatus;
  checkpointId: string | null;
  evidenceIds: string[];
  guardDecision: GuardDecision | null;
  diagnosticOutcome: DiagnosticOutcome | null;
}
