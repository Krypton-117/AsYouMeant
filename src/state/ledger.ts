import type {
  AcceptanceRecordedEvent,
  ActionRecordedEvent,
  CheckpointRecordedEvent,
  EvidenceInvalidatedEvent,
  EvidenceRecordedEvent,
  LedgerEvent,
  LedgerEventBase,
  LedgerNodeView,
  LedgerView,
  NodeStatus,
  NodeTransitionedEvent,
  RecoveryRecordedEvent,
  StateLedgerConfig
} from "./types.js";

export class StateLedgerError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`State ledger rejected the event stream:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "StateLedgerError";
    this.issues = ordered;
  }
}

const legalTransitions: Record<NodeStatus, readonly NodeStatus[]> = {
  PENDING: ["READY", "WAITING_CONTRACT_CHANGE", "CANCELLED"],
  READY: ["RUNNING", "PAUSED", "FAILED", "WAITING_USER", "WAITING_CONTRACT_CHANGE", "CANCELLED"],
  RUNNING: [
    "AWAITING_ACCEPTANCE",
    "PAUSED",
    "FAILED",
    "WAITING_USER",
    "WAITING_CONTRACT_CHANGE",
    "CANCELLED"
  ],
  AWAITING_ACCEPTANCE: [
    "PAUSED",
    "FAILED",
    "WAITING_USER",
    "WAITING_CONTRACT_CHANGE",
    "CANCELLED"
  ],
  CLOSED: [],
  PAUSED: ["CANCELLED"],
  FAILED: ["CANCELLED"],
  WAITING_USER: ["WAITING_CONTRACT_CHANGE", "CANCELLED"],
  WAITING_CONTRACT_CHANGE: ["CANCELLED"],
  CANCELLED: []
};

const recoverableStatuses = new Set<NodeStatus>(["PAUSED", "FAILED", "WAITING_USER"]);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function reject(issue: string): never {
  throw new StateLedgerError([issue]);
}

function requireText(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) reject(`${label} must be non-empty`);
}

function requireIdentity(
  node: LedgerNodeView,
  event: LedgerEventBase,
  purpose: string
): asserts event is LedgerEventBase & { implementationIdentity: string } {
  requireText(event.implementationIdentity, `${purpose} implementation identity`);
  if (node.implementationIdentity !== event.implementationIdentity) {
    reject(
      `${purpose} implementation identity ${event.implementationIdentity} does not match current identity ${node.implementationIdentity ?? "none"}`
    );
  }
}

function validateBase(
  view: LedgerView,
  event: LedgerEvent,
  eventIds: Set<string>,
  nodeIds: Set<string>
): LedgerNodeView {
  requireText(event.eventId, "event id");
  if (eventIds.has(event.eventId)) reject(`event id is duplicated: ${event.eventId}`);
  if (!Number.isInteger(event.sequence) || event.sequence !== view.lastSequence + 1) {
    reject(`event ${event.eventId} sequence must be ${view.lastSequence + 1}`);
  }
  if (event.candidateVersion !== view.candidateVersion) {
    reject(
      `event ${event.eventId} candidate ${event.candidateVersion} does not match ${view.candidateVersion}`
    );
  }
  if (!nodeIds.has(event.nodeId)) reject(`event ${event.eventId} references unknown node ${event.nodeId}`);
  requireText(event.occurredAt, `event ${event.eventId} occurrence time`);
  if (Number.isNaN(Date.parse(event.occurredAt))) {
    reject(`event ${event.eventId} occurrence time is invalid`);
  }
  if (event.implementationIdentity !== null) {
    requireText(event.implementationIdentity, `event ${event.eventId} implementation identity`);
  }
  const node = view.nodes[event.nodeId];
  if (!node) reject(`event ${event.eventId} references unknown node ${event.nodeId}`);
  return node;
}

function applyTransition(
  node: LedgerNodeView,
  event: NodeTransitionedEvent
): void {
  requireText(event.reason, `transition ${event.eventId} reason`);
  if (node.status !== event.from) {
    reject(`transition ${event.eventId} expected ${event.from} but node ${event.nodeId} is ${node.status}`);
  }
  if (!legalTransitions[event.from].includes(event.to)) {
    reject(`illegal transition for ${event.nodeId}: ${event.from} -> ${event.to}`);
  }

  if (event.from === "PENDING" && event.to === "READY") {
    requireText(event.implementationIdentity, `transition ${event.eventId} implementation identity`);
    node.implementationIdentity = event.implementationIdentity;
  } else if (node.implementationIdentity === null) {
    if (event.implementationIdentity !== null) {
      reject(`transition ${event.eventId} cannot assign an implementation outside PENDING -> READY`);
    }
  } else {
    requireIdentity(node, event, `transition ${event.eventId}`);
  }
  node.status = event.to;
}

function applyAction(view: LedgerView, node: LedgerNodeView, event: ActionRecordedEvent): void {
  const action = event.action;
  requireText(action.id, `action in ${event.eventId} id`);
  requireText(action.category, `action ${action.id} category`);
  requireText(action.description, `action ${action.id} description`);
  requireText(action.target, `action ${action.id} target`);
  if (view.actions.some((candidate) => candidate.id === action.id)) {
    reject(`action id is duplicated: ${action.id}`);
  }
  if (node.implementationIdentity === null && event.implementationIdentity !== null) {
    reject(`action ${action.id} must use a null identity before ${event.nodeId} is READY`);
  }
  if (node.implementationIdentity !== null) requireIdentity(node, event, `action ${action.id}`);

  view.actions.push({
    ...clone(action),
    eventId: event.eventId,
    candidateVersion: event.candidateVersion,
    nodeId: event.nodeId,
    implementationIdentity: event.implementationIdentity,
    actor: event.actor,
    occurredAt: event.occurredAt
  });
}

function applyEvidence(
  view: LedgerView,
  node: LedgerNodeView,
  event: EvidenceRecordedEvent
): void {
  requireIdentity(node, event, `evidence event ${event.eventId}`);
  if (node.status !== "RUNNING" && node.status !== "AWAITING_ACCEPTANCE") {
    reject(`evidence ${event.evidence.id} cannot be recorded while ${event.nodeId} is ${node.status}`);
  }
  const evidence = event.evidence;
  requireText(evidence.id, `evidence in ${event.eventId} id`);
  requireText(evidence.criterionId, `evidence ${evidence.id} criterion`);
  requireText(evidence.commandOrAction, `evidence ${evidence.id} command or action`);
  requireText(evidence.observation, `evidence ${evidence.id} observation`);
  requireText(evidence.environmentIdentity, `evidence ${evidence.id} environment identity`);
  requireText(evidence.executedBy, `evidence ${evidence.id} executor`);
  if (view.evidence[evidence.id]) reject(`evidence id is duplicated: ${evidence.id}`);

  view.evidence[evidence.id] = {
    ...clone(evidence),
    eventId: event.eventId,
    candidateVersion: event.candidateVersion,
    nodeId: event.nodeId,
    implementationIdentity: event.implementationIdentity,
    recordedAt: event.occurredAt,
    valid: true,
    invalidatedBy: null,
    invalidatedAt: null,
    invalidationReason: null
  };
}

function applyInvalidation(
  view: LedgerView,
  node: LedgerNodeView,
  event: EvidenceInvalidatedEvent
): void {
  requireIdentity(node, event, `invalidation ${event.eventId}`);
  requireText(event.evidenceId, `invalidation ${event.eventId} evidence id`);
  requireText(event.reason, `invalidation ${event.eventId} reason`);
  const evidence = view.evidence[event.evidenceId];
  if (!evidence) reject(`invalidation ${event.eventId} references unknown evidence ${event.evidenceId}`);
  if (evidence.nodeId !== event.nodeId || evidence.implementationIdentity !== event.implementationIdentity) {
    reject(`invalidation ${event.eventId} does not match evidence ${event.evidenceId} binding`);
  }
  if (!evidence.valid) reject(`evidence ${event.evidenceId} is already stale`);

  evidence.valid = false;
  evidence.invalidatedBy = event.eventId;
  evidence.invalidatedAt = event.occurredAt;
  evidence.invalidationReason = event.reason;

  let invalidatedVerdict = false;
  for (const verdict of view.verdicts) {
    if (verdict.valid && verdict.evidenceIds.includes(event.evidenceId)) {
      verdict.valid = false;
      verdict.invalidatedBy = event.eventId;
      invalidatedVerdict = true;
    }
  }
  if (invalidatedVerdict && (node.status === "CLOSED" || node.status === "FAILED")) {
    node.status = "READY";
  }
}

function applyAcceptance(
  view: LedgerView,
  node: LedgerNodeView,
  event: AcceptanceRecordedEvent
): void {
  requireIdentity(node, event, `acceptance ${event.eventId}`);
  if (node.status !== "AWAITING_ACCEPTANCE") {
    reject(`acceptance ${event.eventId} cannot be recorded while ${event.nodeId} is ${node.status}`);
  }
  requireText(event.environmentIdentity, `acceptance ${event.eventId} environment identity`);
  requireText(event.reason, `acceptance ${event.eventId} reason`);
  if (event.evidenceIds.length === 0) reject(`acceptance ${event.eventId} has no evidence`);
  if (new Set(event.evidenceIds).size !== event.evidenceIds.length) {
    reject(`acceptance ${event.eventId} repeats evidence ids`);
  }
  for (const evidenceId of event.evidenceIds) {
    const evidence = view.evidence[evidenceId];
    if (!evidence) reject(`acceptance ${event.eventId} references unknown evidence ${evidenceId}`);
    if (!evidence.valid) reject(`acceptance ${event.eventId} references stale evidence ${evidenceId}`);
    if (
      evidence.candidateVersion !== event.candidateVersion ||
      evidence.nodeId !== event.nodeId ||
      evidence.implementationIdentity !== event.implementationIdentity ||
      evidence.environmentIdentity !== event.environmentIdentity
    ) {
      reject(`acceptance ${event.eventId} evidence ${evidenceId} has a stale binding`);
    }
  }

  view.verdicts.push({
    eventId: event.eventId,
    candidateVersion: event.candidateVersion,
    nodeId: event.nodeId,
    implementationIdentity: event.implementationIdentity,
    environmentIdentity: event.environmentIdentity,
    verdict: event.verdict,
    evidenceIds: [...event.evidenceIds],
    reason: event.reason,
    acceptedBy: event.actor,
    recordedAt: event.occurredAt,
    valid: true,
    invalidatedBy: null
  });
  node.status = event.verdict === "accepted" ? "CLOSED" : "FAILED";
}

function applyCheckpoint(
  view: LedgerView,
  node: LedgerNodeView,
  event: CheckpointRecordedEvent
): void {
  requireIdentity(node, event, `checkpoint ${event.checkpointId}`);
  if (node.status !== "READY" && node.status !== "RUNNING") {
    reject(`checkpoint ${event.checkpointId} cannot be recorded while ${event.nodeId} is ${node.status}`);
  }
  requireText(event.checkpointId, `checkpoint in ${event.eventId} id`);
  requireText(event.environmentIdentity, `checkpoint ${event.checkpointId} environment identity`);
  requireText(event.summary, `checkpoint ${event.checkpointId} summary`);
  if (view.checkpoints[event.checkpointId]) {
    reject(`checkpoint id is duplicated: ${event.checkpointId}`);
  }
  view.checkpoints[event.checkpointId] = {
    checkpointId: event.checkpointId,
    eventId: event.eventId,
    candidateVersion: event.candidateVersion,
    nodeId: event.nodeId,
    implementationIdentity: event.implementationIdentity,
    environmentIdentity: event.environmentIdentity,
    status: node.status,
    summary: event.summary,
    recordedAt: event.occurredAt
  };
}

function applyRecovery(
  view: LedgerView,
  node: LedgerNodeView,
  event: RecoveryRecordedEvent
): void {
  requireIdentity(node, event, `recovery ${event.eventId}`);
  requireText(event.checkpointId, `recovery ${event.eventId} checkpoint id`);
  requireText(event.reason, `recovery ${event.eventId} reason`);
  if (!recoverableStatuses.has(node.status)) {
    reject(`node ${event.nodeId} cannot recover from ${node.status}`);
  }
  const checkpoint = view.checkpoints[event.checkpointId];
  if (!checkpoint) reject(`recovery ${event.eventId} references unknown checkpoint ${event.checkpointId}`);
  if (
    checkpoint.candidateVersion !== event.candidateVersion ||
    checkpoint.nodeId !== event.nodeId ||
    checkpoint.implementationIdentity !== event.implementationIdentity
  ) {
    reject(`recovery ${event.eventId} checkpoint ${event.checkpointId} has a stale binding`);
  }

  const authorization = event.authorization;
  if (
    authorization.verified !== true ||
    (authorization.authority !== "direct-user" && authorization.authority !== "contract")
  ) {
    reject(`recovery ${event.eventId} is not authorized`);
  }
  requireText(authorization.source, `recovery ${event.eventId} authorization source`);
  if (
    authorization.candidateVersion !== event.candidateVersion ||
    authorization.nodeId !== event.nodeId ||
    authorization.implementationIdentity !== event.implementationIdentity ||
    authorization.checkpointId !== event.checkpointId
  ) {
    reject(`recovery ${event.eventId} authorization does not match its bound target`);
  }

  const from = node.status;
  if (from !== "PAUSED" && from !== "FAILED" && from !== "WAITING_USER") {
    reject(`node ${event.nodeId} cannot recover from ${from}`);
  }
  node.status = checkpoint.status;
  view.recoveries.push({
    eventId: event.eventId,
    candidateVersion: event.candidateVersion,
    nodeId: event.nodeId,
    implementationIdentity: event.implementationIdentity,
    checkpointId: event.checkpointId,
    from,
    to: checkpoint.status,
    authorization: clone(authorization),
    reason: event.reason,
    recordedAt: event.occurredAt
  });
}

function project(config: StateLedgerConfig, events: readonly LedgerEvent[]): LedgerView {
  const nodeIds = new Set(config.nodeIds);
  const nodes: Record<string, LedgerNodeView> = {};
  for (const nodeId of [...nodeIds].sort()) {
    nodes[nodeId] = {
      nodeId,
      status: "PENDING",
      implementationIdentity: null,
      lastEventSequence: null
    };
  }
  const view: LedgerView = {
    candidateVersion: config.candidateVersion,
    lastSequence: 0,
    nodes,
    actions: [],
    evidence: {},
    verdicts: [],
    checkpoints: {},
    recoveries: []
  };
  const eventIds = new Set<string>();

  for (const event of events) {
    const node = validateBase(view, event, eventIds, nodeIds);
    switch (event.kind) {
      case "node-transitioned":
        applyTransition(node, event);
        break;
      case "action-recorded":
        applyAction(view, node, event);
        break;
      case "evidence-recorded":
        applyEvidence(view, node, event);
        break;
      case "evidence-invalidated":
        applyInvalidation(view, node, event);
        break;
      case "acceptance-recorded":
        applyAcceptance(view, node, event);
        break;
      case "checkpoint-recorded":
        applyCheckpoint(view, node, event);
        break;
      case "recovery-recorded":
        applyRecovery(view, node, event);
        break;
      default:
        reject(`unknown event kind: ${String((event as { kind?: unknown }).kind)}`);
    }
    node.lastEventSequence = event.sequence;
    view.lastSequence = event.sequence;
    eventIds.add(event.eventId);
  }
  return view;
}

function validateConfig(config: StateLedgerConfig): StateLedgerConfig {
  requireText(config.candidateVersion, "ledger candidate version");
  if (config.nodeIds.length === 0) reject("ledger must bind at least one node");
  for (const nodeId of config.nodeIds) requireText(nodeId, "ledger node id");
  if (new Set(config.nodeIds).size !== config.nodeIds.length) reject("ledger node ids must be unique");
  return {
    candidateVersion: config.candidateVersion,
    nodeIds: [...config.nodeIds].sort()
  };
}

export class StateLedger {
  readonly #config: StateLedgerConfig;
  #events: LedgerEvent[];

  constructor(config: StateLedgerConfig, events: readonly LedgerEvent[] = []) {
    this.#config = validateConfig(clone(config));
    const restored = clone([...events]);
    project(this.#config, restored);
    this.#events = restored;
  }

  append(event: LedgerEvent): LedgerView {
    const next = [...this.#events, clone(event)];
    const view = project(this.#config, next);
    this.#events = next;
    return clone(view);
  }

  replay(): LedgerView {
    return clone(project(this.#config, this.#events));
  }

  events(): LedgerEvent[] {
    return clone(this.#events);
  }
}
// SPDX-License-Identifier: MPL-2.0
