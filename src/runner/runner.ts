import type { DiagnosticOutcome } from "../diagnostics/types.js";
import type { GuardDecision, MajorLoopPermit } from "../guard/types.js";
import type {
  ActionOutcome,
  CheckpointRecordedEvent,
  EvidenceRecord,
  LedgerActor,
  LedgerEventBase,
  NodeStatus,
  RecoveryAuthorization
} from "../state/types.js";
import type {
  NodeExecutionResult,
  RunnerContractProjection,
  RunnerControlAuthority,
  RunnerDependencies,
  RunnerNodeDefinition,
  RunnerOutcome
} from "./types.js";

export class MajorLoopRunnerError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`Major-loop runner configuration is invalid:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "MajorLoopRunnerError";
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

function validateProjection(
  projection: RunnerContractProjection,
  dependencies: RunnerDependencies,
  runnerIdentity: string
): void {
  const issues = duplicates(projection.nodes.map((node) => node.nodeId), "runner node id");
  if (!isNonEmpty(runnerIdentity)) issues.push("runner identity is empty");
  if (!isNonEmpty(projection.candidateVersion)) issues.push("runner candidate version is empty");
  if (!isNonEmpty(projection.projectionIdentity)) issues.push("runner projection identity is empty");
  const knownNodes = new Set(projection.nodes.map((node) => node.nodeId));
  const ledgerView = dependencies.ledger.replay();
  if (ledgerView.candidateVersion !== projection.candidateVersion) {
    issues.push("runner projection and state ledger candidates differ");
  }
  for (const node of projection.nodes) {
    if (!isNonEmpty(node.nodeId)) issues.push("runner node id is empty");
    if (!isNonEmpty(node.implementationIdentity)) {
      issues.push(`runner node ${node.nodeId} implementation identity is empty`);
    }
    if (!isNonEmpty(node.environmentIdentity)) {
      issues.push(`runner node ${node.nodeId} environment identity is empty`);
    }
    if (!ledgerView.nodes[node.nodeId]) issues.push(`state ledger omits runner node ${node.nodeId}`);
    for (const dependencyId of node.requiredNodeIds) {
      if (!knownNodes.has(dependencyId)) {
        issues.push(`runner node ${node.nodeId} requires unknown node ${dependencyId}`);
      }
      if (dependencyId === node.nodeId) issues.push(`runner node ${node.nodeId} requires itself`);
    }
    if (!Number.isInteger(node.budget.normalRuns) || node.budget.normalRuns < 0) {
      issues.push(`runner node ${node.nodeId} normal run budget is invalid`);
    }
    if (!Number.isInteger(node.budget.environmentRebuilds) || node.budget.environmentRebuilds < 0) {
      issues.push(`runner node ${node.nodeId} environment rebuild budget is invalid`);
    }
  }
  if (issues.length > 0) throw new MajorLoopRunnerError(issues);
}

function validateExecutionResult(node: RunnerNodeDefinition, result: NodeExecutionResult): void {
  const issues = duplicates(result.evidence.map((evidence) => evidence.id), `node ${node.nodeId} evidence id`);
  if ((result.outcome === "completed" || result.outcome === "failed") && result.evidence.length === 0) {
    issues.push(`node ${node.nodeId} ${result.outcome} without evidence`);
  }
  if (result.outcome === "failed" && !result.evidence.some((evidence) => evidence.result === "failed")) {
    issues.push(`node ${node.nodeId} failed without failed evidence`);
  }
  if (result.acceptance) {
    if (result.outcome !== "completed") {
      issues.push(`node ${node.nodeId} supplied acceptance for ${result.outcome} execution`);
    }
    if (result.acceptance.evidenceIds.length === 0) {
      issues.push(`node ${node.nodeId} acceptance has no evidence`);
    }
    const available = new Set(result.evidence.map((evidence) => evidence.id));
    for (const evidenceId of result.acceptance.evidenceIds) {
      if (!available.has(evidenceId)) {
        issues.push(`node ${node.nodeId} acceptance references unreturned evidence ${evidenceId}`);
      }
    }
    if (!isNonEmpty(result.acceptance.reason)) issues.push(`node ${node.nodeId} acceptance reason is empty`);
  }
  if (issues.length > 0) throw new MajorLoopRunnerError(issues);
}

function syntheticFailure(node: RunnerNodeDefinition, error: unknown, evidenceId: string): NodeExecutionResult {
  return {
    outcome: "failed",
    evidence: [
      {
        id: evidenceId,
        criterionId: `${node.nodeId}-EXECUTION`,
        commandOrAction: node.executionAction.id,
        result: "failed",
        observation: error instanceof Error ? error.message : String(error),
        environmentIdentity: node.environmentIdentity,
        executedBy: "major-loop-runner"
      }
    ],
    acceptance: null
  };
}

export class MajorLoopRunner {
  readonly #projection: RunnerContractProjection;
  readonly #dependencies: RunnerDependencies;
  readonly #runnerIdentity: string;

  constructor(
    projection: RunnerContractProjection,
    dependencies: RunnerDependencies,
    runnerIdentity: string
  ) {
    validateProjection(projection, dependencies, runnerIdentity);
    this.#projection = clone(projection);
    this.#dependencies = dependencies;
    this.#runnerIdentity = runnerIdentity;
  }

  run(nodeId: string, permit: MajorLoopPermit | null): RunnerOutcome {
    const node = this.#node(nodeId);
    if (!node) return this.#plainRejection(nodeId, "UNKNOWN_NODE", `Unknown runner node ${nodeId}.`);
    if (this.#projection.status !== "CLOSED") {
      return this.#reject(node, "CONTRACT_NOT_CLOSED", "The task contract is not closed and executable.");
    }

    const view = this.#dependencies.ledger.replay();
    const nodeView = view.nodes[nodeId];
    if (!nodeView) return this.#plainRejection(nodeId, "UNKNOWN_NODE", `Unknown ledger node ${nodeId}.`);
    if (nodeView.status !== "PENDING" && nodeView.status !== "READY") {
      return this.#reject(
        node,
        "NODE_NOT_RUNNABLE",
        `Node ${nodeId} is ${nodeView.status}; run accepts only PENDING or READY nodes.`
      );
    }

    const unclosed = node.requiredNodeIds.filter((dependencyId) => view.nodes[dependencyId]?.status !== "CLOSED");
    if (unclosed.length > 0) {
      return this.#reject(
        node,
        "DEPENDENCY_NOT_CLOSED",
        `Node ${nodeId} is waiting for: ${unclosed.join(", ")}.`
      );
    }
    const otherActive = Object.values(view.nodes).find(
      (candidate) =>
        candidate.nodeId !== nodeId &&
        (candidate.status === "RUNNING" || candidate.status === "AWAITING_ACCEPTANCE")
    );
    if (otherActive) {
      return this.#reject(
        node,
        "ANOTHER_NODE_IS_ACTIVE",
        `Node ${otherActive.nodeId} must close or pause before ${nodeId} starts.`
      );
    }

    const normalRuns = view.actions.filter(
      (candidate) =>
        candidate.nodeId === nodeId &&
        candidate.category === "major-loop-run" &&
        (candidate.outcome === "allowed" || candidate.outcome === "observed")
    ).length;
    if (normalRuns >= node.budget.normalRuns) {
      return this.#reject(node, "NORMAL_RUN_BUDGET_EXHAUSTED", `Node ${nodeId} has no normal runs left.`);
    }

    const guardDecision = this.#dependencies.guard.decide({
      phase: "major-loop",
      now: this.#now(),
      permit,
      action: clone(node.executionAction)
    });
    if (guardDecision.outcome === "deny") {
      this.#recordAction(node, "denied", guardDecision.reason, node.executionAction.id);
      return this.#outcome(
        node,
        "rejected",
        guardDecision.reasonCode,
        guardDecision.reason,
        null,
        [],
        guardDecision,
        null
      );
    }

    if (nodeView.status === "PENDING") {
      this.#transition(node, "PENDING", "READY", "Dependencies, permit, and resources are ready.");
    }
    this.#transition(node, "READY", "RUNNING", "The Guard allowed the active node.");
    const checkpointId = `${this.#runnerIdentity}:checkpoint:${node.nodeId}:${this.#nextSequence()}`;
    this.#appendCheckpoint(node, checkpointId);
    this.#recordAction(
      node,
      guardDecision.outcome === "observe" ? "observed" : "allowed",
      guardDecision.reason,
      node.executionAction.id,
      "major-loop-run"
    );

    let execution: NodeExecutionResult;
    try {
      execution = this.#dependencies.executeNode(clone(node), checkpointId);
      validateExecutionResult(node, execution);
    } catch (error) {
      execution = syntheticFailure(
        node,
        error,
        `${this.#runnerIdentity}:failure:${node.nodeId}:${this.#nextSequence()}`
      );
    }

    this.#recordAction(
      node,
      execution.outcome === "failed" ? "failed" : "completed",
      `Node execution returned ${execution.outcome}.`,
      node.executionAction.id,
      "major-loop-result"
    );
    for (const evidence of execution.evidence) this.#appendEvidence(node, evidence);

    switch (execution.outcome) {
      case "completed": {
        this.#transition(node, "RUNNING", "AWAITING_ACCEPTANCE", "Execution completed with evidence.");
        if (execution.acceptance) {
          this.#appendAcceptance(node, execution.acceptance);
          const status = this.#status(node.nodeId);
          return this.#outcome(
            node,
            status === "CLOSED" ? "closed" : "failed",
            status === "CLOSED" ? "NODE_CLOSED" : "NODE_REJECTED",
            execution.acceptance.reason,
            checkpointId,
            execution.evidence.map((evidence) => evidence.id),
            guardDecision,
            null
          );
        }
        return this.#outcome(
          node,
          "awaiting-acceptance",
          "AWAITING_ACCEPTANCE",
          "Execution evidence is ready for the configured acceptor.",
          checkpointId,
          execution.evidence.map((evidence) => evidence.id),
          guardDecision,
          null
        );
      }
      case "failed": {
        this.#transition(node, "RUNNING", "FAILED", "Execution returned failed evidence.");
        const failureId = execution.evidence.find((evidence) => evidence.result === "failed")?.id;
        const diagnostic = failureId
          ? this.#dependencies.diagnoseFailure(failureId, clone(node.budget.diagnostic))
          : null;
        return this.#outcome(
          node,
          "failed",
          "NODE_EXECUTION_FAILED",
          "The node failed and entered the bounded diagnostic route.",
          checkpointId,
          execution.evidence.map((evidence) => evidence.id),
          guardDecision,
          diagnostic
        );
      }
      case "paused":
        this.#transition(node, "RUNNING", "PAUSED", "Execution paused at its checkpoint.");
        return this.#outcome(
          node,
          "paused",
          "NODE_PAUSED",
          "The node is paused and can recover only from its bound checkpoint.",
          checkpointId,
          execution.evidence.map((evidence) => evidence.id),
          guardDecision,
          null
        );
      case "waiting-user":
        this.#transition(node, "RUNNING", "WAITING_USER", "Execution requires a user-owned decision.");
        return this.#outcome(
          node,
          "waiting-user",
          "WAITING_USER",
          "The node is waiting for the user.",
          checkpointId,
          execution.evidence.map((evidence) => evidence.id),
          guardDecision,
          null
        );
      case "waiting-contract-change":
        this.#transition(
          node,
          "RUNNING",
          "WAITING_CONTRACT_CHANGE",
          "Execution found a contract-changing requirement."
        );
        return this.#outcome(
          node,
          "waiting-contract-change",
          "WAITING_CONTRACT_CHANGE",
          "The current candidate cannot authorize the required change.",
          checkpointId,
          execution.evidence.map((evidence) => evidence.id),
          guardDecision,
          null
        );
    }
  }

  pause(nodeId: string, authority: RunnerControlAuthority): RunnerOutcome {
    const node = this.#node(nodeId);
    if (!node) return this.#plainRejection(nodeId, "UNKNOWN_NODE", `Unknown runner node ${nodeId}.`);
    if (!this.#validControl(authority)) {
      return this.#reject(node, "CONTROL_SOURCE_UNVERIFIED", "Pause source is not verified.");
    }
    const status = this.#status(nodeId);
    if (status !== "READY" && status !== "RUNNING" && status !== "AWAITING_ACCEPTANCE") {
      return this.#reject(node, "NODE_NOT_PAUSABLE", `Node ${nodeId} cannot pause from ${status}.`);
    }
    let checkpointId = this.#latestCheckpointId(nodeId);
    if (!checkpointId && (status === "READY" || status === "RUNNING")) {
      checkpointId = `${this.#runnerIdentity}:checkpoint:${node.nodeId}:${this.#nextSequence()}`;
      this.#appendCheckpoint(node, checkpointId);
    }
    this.#recordAction(node, "completed", authority.source, "pause", "control");
    this.#transition(node, status, "PAUSED", authority.source, authority.authority === "direct-user" ? "user" : "guard");
    return this.#outcome(
      node,
      "paused",
      "NODE_PAUSED",
      authority.source,
      checkpointId,
      [],
      null,
      null
    );
  }

  stop(nodeId: string, authority: RunnerControlAuthority): RunnerOutcome {
    const node = this.#node(nodeId);
    if (!node) return this.#plainRejection(nodeId, "UNKNOWN_NODE", `Unknown runner node ${nodeId}.`);
    if (!this.#validControl(authority)) {
      return this.#reject(node, "CONTROL_SOURCE_UNVERIFIED", "Stop source is not verified.");
    }
    const status = this.#status(nodeId);
    if (status === "CLOSED" || status === "CANCELLED") {
      return this.#reject(node, "NODE_NOT_STOPPABLE", `Node ${nodeId} cannot stop from ${status}.`);
    }
    this.#recordAction(node, "completed", authority.source, "stop", "control");
    this.#transition(
      node,
      status,
      "CANCELLED",
      authority.source,
      authority.authority === "direct-user" ? "user" : "guard"
    );
    return this.#outcome(node, "cancelled", "NODE_CANCELLED", authority.source, null, [], null, null);
  }

  resume(
    nodeId: string,
    permit: MajorLoopPermit | null,
    authority: RunnerControlAuthority
  ): RunnerOutcome {
    const node = this.#node(nodeId);
    if (!node) return this.#plainRejection(nodeId, "UNKNOWN_NODE", `Unknown runner node ${nodeId}.`);
    if (!this.#validControl(authority)) {
      return this.#reject(node, "CONTROL_SOURCE_UNVERIFIED", "Recovery source is not verified.");
    }
    const status = this.#status(nodeId);
    if (status !== "PAUSED" && status !== "FAILED" && status !== "WAITING_USER") {
      return this.#reject(node, "NODE_NOT_RECOVERABLE", `Node ${nodeId} cannot recover from ${status}.`);
    }
    const checkpointId = this.#latestCheckpointId(nodeId);
    if (!checkpointId) {
      return this.#reject(node, "RECOVERY_CHECKPOINT_MISSING", `Node ${nodeId} has no recovery checkpoint.`);
    }
    const decision = this.#dependencies.guard.decide({
      phase: "major-loop",
      now: this.#now(),
      permit,
      action: clone(node.resumeAction)
    });
    if (decision.outcome === "deny") {
      this.#recordAction(node, "denied", decision.reason, node.resumeAction.id, "control");
      return this.#outcome(
        node,
        "rejected",
        decision.reasonCode,
        decision.reason,
        checkpointId,
        [],
        decision,
        null
      );
    }

    const current = this.#dependencies.ledger.replay().nodes[nodeId];
    if (!current?.implementationIdentity) {
      return this.#reject(node, "RECOVERY_IDENTITY_MISSING", `Node ${nodeId} has no active identity.`);
    }
    const authorization: RecoveryAuthorization = {
      verified: true,
      authority: authority.authority,
      source: authority.source,
      candidateVersion: this.#projection.candidateVersion,
      nodeId,
      implementationIdentity: current.implementationIdentity,
      checkpointId
    };
    this.#recordAction(
      node,
      decision.outcome === "observe" ? "observed" : "allowed",
      authority.source,
      node.resumeAction.id,
      "control"
    );
    const meta = this.#eventBase(node, "guard");
    this.#dependencies.ledger.append({
      ...meta,
      kind: "recovery-recorded",
      checkpointId,
      authorization,
      reason: authority.source
    });
    return this.#outcome(
      node,
      "recovered",
      "NODE_RECOVERED",
      authority.source,
      checkpointId,
      [],
      decision,
      null
    );
  }

  #node(nodeId: string): RunnerNodeDefinition | undefined {
    const node = this.#projection.nodes.find((candidate) => candidate.nodeId === nodeId);
    return node ? clone(node) : undefined;
  }

  #status(nodeId: string): NodeStatus {
    const node = this.#dependencies.ledger.replay().nodes[nodeId];
    if (!node) throw new MajorLoopRunnerError([`state ledger omits node ${nodeId}`]);
    return node.status;
  }

  #nextSequence(): number {
    return this.#dependencies.ledger.replay().lastSequence + 1;
  }

  #now(): string {
    const value = this.#dependencies.now();
    if (!isNonEmpty(value) || Number.isNaN(Date.parse(value))) {
      throw new MajorLoopRunnerError(["runner clock returned an invalid time"]);
    }
    return value;
  }

  #eventBase(node: RunnerNodeDefinition, actor: LedgerActor): LedgerEventBase {
    const view = this.#dependencies.ledger.replay().nodes[node.nodeId];
    const sequence = this.#nextSequence();
    return {
      eventId: `${this.#runnerIdentity}:event:${sequence}`,
      candidateVersion: this.#projection.candidateVersion,
      sequence,
      occurredAt: this.#now(),
      actor,
      nodeId: node.nodeId,
      implementationIdentity: view?.implementationIdentity ?? null
    };
  }

  #transition(
    node: RunnerNodeDefinition,
    from: NodeStatus,
    to: NodeStatus,
    reason: string,
    actor: LedgerActor = "agent"
  ): void {
    const meta = this.#eventBase(node, actor);
    this.#dependencies.ledger.append({
      ...meta,
      implementationIdentity:
        from === "PENDING" && to === "READY" ? node.implementationIdentity : meta.implementationIdentity,
      kind: "node-transitioned",
      from,
      to,
      reason
    });
  }

  #appendCheckpoint(node: RunnerNodeDefinition, checkpointId: string): void {
    const meta = this.#eventBase(node, "agent");
    const event: CheckpointRecordedEvent = {
      ...meta,
      kind: "checkpoint-recorded",
      checkpointId,
      environmentIdentity: node.environmentIdentity,
      summary: `Resume ${node.nodeId} at ${this.#status(node.nodeId)} under ${node.implementationIdentity}.`
    };
    this.#dependencies.ledger.append(event);
  }

  #appendEvidence(node: RunnerNodeDefinition, evidence: EvidenceRecord): void {
    const meta = this.#eventBase(node, "automated-oracle");
    this.#dependencies.ledger.append({ ...meta, kind: "evidence-recorded", evidence: clone(evidence) });
  }

  #appendAcceptance(
    node: RunnerNodeDefinition,
    acceptance: NonNullable<NodeExecutionResult["acceptance"]>
  ): void {
    const meta = this.#eventBase(node, acceptance.actor);
    this.#dependencies.ledger.append({
      ...meta,
      kind: "acceptance-recorded",
      verdict: acceptance.verdict,
      evidenceIds: [...acceptance.evidenceIds],
      environmentIdentity: node.environmentIdentity,
      reason: acceptance.reason
    });
  }

  #recordAction(
    node: RunnerNodeDefinition,
    outcome: ActionOutcome,
    description: string,
    actionName: string,
    category = "runner-rejection"
  ): void {
    const meta = this.#eventBase(node, "guard");
    this.#dependencies.ledger.append({
      ...meta,
      kind: "action-recorded",
      action: {
        id: `${actionName}:${meta.sequence}`,
        category,
        description,
        target: node.nodeId,
        outcome
      }
    });
  }

  #latestCheckpointId(nodeId: string): string | null {
    const events = this.#dependencies.ledger.events();
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.kind === "checkpoint-recorded" && event.nodeId === nodeId) {
        return event.checkpointId;
      }
    }
    return null;
  }

  #validControl(authority: RunnerControlAuthority): boolean {
    return (
      authority.verified === true &&
      (authority.authority === "direct-user" || authority.authority === "contract") &&
      isNonEmpty(authority.source)
    );
  }

  #reject(node: RunnerNodeDefinition, reasonCode: string, reason: string): RunnerOutcome {
    this.#recordAction(node, "denied", reason, reasonCode);
    return this.#outcome(node, "rejected", reasonCode, reason, null, [], null, null);
  }

  #plainRejection(nodeId: string, reasonCode: string, reason: string): RunnerOutcome {
    return {
      outcome: "rejected",
      reasonCode,
      reason,
      nodeId,
      nodeStatus: "PENDING",
      checkpointId: null,
      evidenceIds: [],
      guardDecision: null,
      diagnosticOutcome: null
    };
  }

  #outcome(
    node: RunnerNodeDefinition,
    outcome: RunnerOutcome["outcome"],
    reasonCode: string,
    reason: string,
    checkpointId: string | null,
    evidenceIds: string[],
    guardDecision: GuardDecision | null,
    diagnosticOutcome: DiagnosticOutcome | null
  ): RunnerOutcome {
    return {
      outcome,
      reasonCode,
      reason,
      nodeId: node.nodeId,
      nodeStatus: this.#status(node.nodeId),
      checkpointId,
      evidenceIds: [...evidenceIds],
      guardDecision: guardDecision ? clone(guardDecision) : null,
      diagnosticOutcome: diagnosticOutcome ? clone(diagnosticOutcome) : null
    };
  }
}
// SPDX-License-Identifier: MPL-2.0
