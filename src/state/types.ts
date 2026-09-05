export type NormalNodeStatus =
  | "PENDING"
  | "READY"
  | "RUNNING"
  | "AWAITING_ACCEPTANCE"
  | "CLOSED";

export type BypassNodeStatus =
  | "PAUSED"
  | "FAILED"
  | "WAITING_USER"
  | "WAITING_CONTRACT_CHANGE"
  | "CANCELLED";

export type NodeStatus = NormalNodeStatus | BypassNodeStatus;

export type LedgerActor = "agent" | "user" | "automated-oracle" | "guard" | "host";

export interface StateLedgerConfig {
  candidateVersion: string;
  nodeIds: string[];
}

export interface LedgerEventBase {
  eventId: string;
  candidateVersion: string;
  sequence: number;
  occurredAt: string;
  actor: LedgerActor;
  nodeId: string;
  implementationIdentity: string | null;
}

export interface NodeTransitionedEvent extends LedgerEventBase {
  kind: "node-transitioned";
  from: NodeStatus;
  to: NodeStatus;
  reason: string;
}

export type ActionOutcome = "allowed" | "observed" | "denied" | "completed" | "failed";

export interface ActionRecord {
  id: string;
  category: string;
  description: string;
  target: string;
  outcome: ActionOutcome;
}

export interface ActionRecordedEvent extends LedgerEventBase {
  kind: "action-recorded";
  action: ActionRecord;
}

export interface EvidenceRecord {
  id: string;
  criterionId: string;
  commandOrAction: string;
  result: "passed" | "failed";
  observation: string;
  environmentIdentity: string;
  executedBy: string;
}

export interface EvidenceRecordedEvent extends LedgerEventBase {
  kind: "evidence-recorded";
  evidence: EvidenceRecord;
}

export interface EvidenceInvalidatedEvent extends LedgerEventBase {
  kind: "evidence-invalidated";
  evidenceId: string;
  reason: string;
}

export interface AcceptanceRecordedEvent extends LedgerEventBase {
  kind: "acceptance-recorded";
  verdict: "accepted" | "rejected";
  evidenceIds: string[];
  environmentIdentity: string;
  reason: string;
}

export interface CheckpointRecordedEvent extends LedgerEventBase {
  kind: "checkpoint-recorded";
  checkpointId: string;
  environmentIdentity: string;
  summary: string;
}

export interface RecoveryAuthorization {
  verified: true;
  authority: "direct-user" | "contract";
  source: string;
  candidateVersion: string;
  nodeId: string;
  implementationIdentity: string;
  checkpointId: string;
}

export interface RecoveryRecordedEvent extends LedgerEventBase {
  kind: "recovery-recorded";
  checkpointId: string;
  authorization: RecoveryAuthorization;
  reason: string;
}

export type LedgerEvent =
  | NodeTransitionedEvent
  | ActionRecordedEvent
  | EvidenceRecordedEvent
  | EvidenceInvalidatedEvent
  | AcceptanceRecordedEvent
  | CheckpointRecordedEvent
  | RecoveryRecordedEvent;

export interface LedgerNodeView {
  nodeId: string;
  status: NodeStatus;
  implementationIdentity: string | null;
  lastEventSequence: number | null;
}

export interface LedgerActionView extends ActionRecord {
  eventId: string;
  candidateVersion: string;
  nodeId: string;
  implementationIdentity: string | null;
  actor: LedgerActor;
  occurredAt: string;
}

export interface LedgerEvidenceView extends EvidenceRecord {
  eventId: string;
  candidateVersion: string;
  nodeId: string;
  implementationIdentity: string;
  recordedAt: string;
  valid: boolean;
  invalidatedBy: string | null;
  invalidatedAt: string | null;
  invalidationReason: string | null;
}

export interface AcceptanceVerdictView {
  eventId: string;
  candidateVersion: string;
  nodeId: string;
  implementationIdentity: string;
  environmentIdentity: string;
  verdict: "accepted" | "rejected";
  evidenceIds: string[];
  reason: string;
  acceptedBy: LedgerActor;
  recordedAt: string;
  valid: boolean;
  invalidatedBy: string | null;
}

export interface CheckpointView {
  checkpointId: string;
  eventId: string;
  candidateVersion: string;
  nodeId: string;
  implementationIdentity: string;
  environmentIdentity: string;
  status: "READY" | "RUNNING";
  summary: string;
  recordedAt: string;
}

export interface RecoveryView {
  eventId: string;
  candidateVersion: string;
  nodeId: string;
  implementationIdentity: string;
  checkpointId: string;
  from: "PAUSED" | "FAILED" | "WAITING_USER";
  to: "READY" | "RUNNING";
  authorization: RecoveryAuthorization;
  reason: string;
  recordedAt: string;
}

export interface LedgerView {
  candidateVersion: string;
  lastSequence: number;
  nodes: Record<string, LedgerNodeView>;
  actions: LedgerActionView[];
  evidence: Record<string, LedgerEvidenceView>;
  verdicts: AcceptanceVerdictView[];
  checkpoints: Record<string, CheckpointView>;
  recoveries: RecoveryView[];
}
