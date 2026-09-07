import type { ActionOutcome } from "../state/types.js";

export type HostId = "codex" | "claude-code" | "opencode" | "dsh";
export type NativeStartSourceKind =
  | "codex-user-prompt-submit"
  | "claude-user-prompt-expansion"
  | "opencode-command-transform"
  | "dsh-skill-invocation";

export interface NativeStartPath {
  host: HostId;
  sourceKind: NativeStartSourceKind;
  command: string;
}

export interface NativeStartEvidence extends NativeStartPath {
  actor: "user";
  adapterVerified: true;
  evidenceId: string;
}

export interface PreLoopReviewBinding {
  result: "PRE_LOOP_REVIEW_PASSED" | "PRE_LOOP_REVIEW_FAILED";
  candidateVersion: string;
  projectionIdentity: string;
}

export interface PermitRequest {
  permitId: string;
  candidateVersion: string;
  projectionIdentity: string;
  issuedAt: string;
  expiresAt: string;
  nativeStart: NativeStartEvidence;
}

export interface MajorLoopPermit extends PermitRequest {
  status: "active";
}

export type TaskMode = "answer" | "review" | "change" | "monitoring" | "open-work";
export type ControlLevel = "observation" | "guard" | "hard-lock" | "off";
export type GuardPhase = "pre-loop" | "pre-start" | "major-loop" | "post-product";
export type ExecutionState = "active" | "paused" | "stopped";
export type ScopePolicy = "deny" | "ask" | "allow";

export type ActionKind =
  | "read"
  | "write"
  | "test"
  | "dependency"
  | "hash"
  | "delegate"
  | "network"
  | "external-write"
  | "delivery"
  | "control";

export type ActionBasis =
  | { kind: "requested"; requirementIds: string[] }
  | {
      kind: "necessary-consequence";
      consumerIds: string[];
      reachableEvidenceIds: string[];
      omissionFailsAcceptance: boolean;
    }
  | { kind: "unapproved-expansion" };

export interface TestActionContext {
  testId: string;
  classification: "acceptance" | "diagnostic" | "regression" | "exploratory-repeated";
  consumerNodeId: string;
  implementationIdentity: string;
  hasEquivalentValidEvidence: boolean;
  relevantChange: boolean;
  contractRequiresRepeat: boolean;
  failureEvidenceId: string | null;
  hypothesisIds: string[];
  discriminating: boolean;
}

export interface RetryContext {
  attempt: number;
  newEvidenceIds: string[];
  relatedImplementationChanged: boolean;
  environmentInvalidated: boolean;
}

export interface RepeatContext {
  priorActionId: string;
  newEvidenceExpected: boolean;
  relatedChange: boolean;
}

export interface GuardAction {
  id: string;
  workItemId: string | null;
  kind: ActionKind;
  mutability: "read" | "write" | "unknown";
  basis: ActionBasis;
  targetPaths: string[];
  dependencyNames: string[];
  hashConsumerId: string | null;
  hardening: boolean;
  reachability: "reachable" | "unreachable" | "unknown";
  delegationCount: number;
  boundedDelegation: boolean;
  networkTargets: string[];
  externalWriteTargets: string[];
  privilegeExpansion: boolean;
  contradictsUserIntent: boolean;
  test: TestActionContext | null;
  retry: RetryContext | null;
  repeat: RepeatContext | null;
}

export interface GuardPolicy {
  taskMode: TaskMode;
  controlLevel: ControlLevel;
  executionState: ExecutionState;
  allowedWorkItemIds: string[];
  allowedPaths: string[];
  dependencyPolicy: ScopePolicy;
  allowedDependencies: string[];
  hashPolicy: ScopePolicy;
  allowedHashConsumerIds: string[];
  agentBudget: number;
  agentsUsed: number;
  allowedTestIds: string[];
  retryBudget: number;
  allowedNetworkTargets: string[];
  allowedExternalWriteTargets: string[];
  deliveryAllowed: boolean;
}

export interface GuardConfig {
  candidateVersion: string;
  projectionIdentity: string;
  review: PreLoopReviewBinding;
  nativeStartPaths: NativeStartPath[];
  policy: GuardPolicy;
}

export interface GuardDecisionContext {
  governanceMode?: import("./session.js").GovernanceMode;
  phase: GuardPhase;
  now: string;
  permit: MajorLoopPermit | null;
  action: GuardAction;
}

export type StopCategory =
  | "scope-creep"
  | "hashing-or-hypothetical-hardening"
  | "intent-violation"
  | "task-thrashing";

export type GuardOutcome = "allow" | "observe" | "deny";

export type HostEffect =
  | { outcome: "unobserved"; evidenceId: null }
  | { outcome: "allowed" | "blocked" | "failed"; evidenceId: string };

export type HumanFeedback =
  | { label: "unlabeled"; source: null }
  | { label: "correct" | "incorrect" | "inconclusive"; source: string };

export interface GuardRuntimeEvidence {
  candidateVersion: string;
  projectionIdentity: string;
  actionId: string;
  permitId: string | null;
  ledgerOutcome: ActionOutcome;
}

export interface GuardDecision {
  outcome: GuardOutcome;
  category: StopCategory | null;
  reasonCode: string;
  reason: string;
  next: string | null;
  guardEffect: "allowed" | "observed" | "denied";
  hostEffect: HostEffect;
  feedback: HumanFeedback;
  runtimeEvidence: GuardRuntimeEvidence;
}
// SPDX-License-Identifier: MPL-2.0
