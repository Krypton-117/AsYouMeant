import assert from "node:assert/strict";
import test from "node:test";

import {
  Guard,
  MajorLoopRunner,
  StateLedger,
  type DiagnosticOutcome,
  type GuardAction,
  type GuardConfig,
  type MajorLoopPermit,
  type NodeExecutionResult,
  type RunnerContractProjection,
  type RunnerNodeDefinition
} from "../src/index.js";

const candidateVersion = "2026-09-04.30";
const projectionIdentity = "projection-2026-09-04.30/1";
const startCommand = "$major-loop-runner start candidate=2026-09-04.30";

const runnerAction = (nodeId: string, suffix: "run" | "resume"): GuardAction => ({
  id: `A-${nodeId}-${suffix}`,
  workItemId: `W-${nodeId}-${suffix}`,
  kind: suffix === "run" ? "write" : "control",
  mutability: "write",
  basis: { kind: "requested", requirementIds: ["R4", "R11"] },
  targetPaths: [`src/${nodeId.toLowerCase()}.ts`],
  dependencyNames: [],
  hashConsumerId: null,
  hardening: false,
  reachability: "reachable",
  delegationCount: 0,
  boundedDelegation: true,
  networkTargets: [],
  externalWriteTargets: [],
  privilegeExpansion: false,
  contradictsUserIntent: false,
  test: null,
  retry: null,
  repeat: null
});

const runnerNode = (nodeId: string, requiredNodeIds: string[] = []): RunnerNodeDefinition => ({
  nodeId,
  implementationIdentity: `candidate/C5/${nodeId}/1`,
  environmentIdentity: "windows-node-24.11.1",
  requiredNodeIds,
  executionAction: runnerAction(nodeId, "run"),
  resumeAction: runnerAction(nodeId, "resume"),
  budget: {
    normalRuns: 1,
    diagnostic: { maxProbes: 1, maxCost: 1 },
    environmentRebuilds: 1
  }
});

const stoppedDiagnostic = (failureEvidenceId: string): DiagnosticOutcome => ({
  status: "stopped",
  reasonCode: "NO_DISCRIMINATING_PROBE",
  reason: `No discriminating probe exists for ${failureEvidenceId}.`,
  next: "Stop and report the failure.",
  probeResult: null,
  guardDecision: null,
  remainingHypothesisIds: [],
  provenFix: null
});

const completed = (node: RunnerNodeDefinition, automatic = true): NodeExecutionResult => {
  const evidenceId = `E-${node.nodeId}-PASS`;
  return {
    outcome: "completed",
    evidence: [
      {
        id: evidenceId,
        criterionId: `${node.nodeId}-ORACLE`,
        commandOrAction: node.executionAction.id,
        result: "passed",
        observation: `${node.nodeId} produced its contracted output.`,
        environmentIdentity: node.environmentIdentity,
        executedBy: "automated-oracle"
      }
    ],
    acceptance: automatic
      ? {
          verdict: "accepted",
          evidenceIds: [evidenceId],
          reason: `${node.nodeId} oracle accepted the evidence.`,
          actor: "automated-oracle"
        }
      : null
  };
};

interface Setup {
  runner: MajorLoopRunner;
  ledger: StateLedger;
  permit: MajorLoopPermit;
}

const setup = (
  nodes: RunnerNodeDefinition[],
  executeNode: (node: RunnerNodeDefinition, checkpointId: string) => NodeExecutionResult,
  options: {
    contractStatus?: "OPEN" | "CLOSED";
    diagnoseFailure?: (failureEvidenceId: string) => DiagnosticOutcome;
  } = {}
): Setup => {
  const ledger = new StateLedger({
    candidateVersion,
    nodeIds: nodes.map((node) => node.nodeId)
  });
  const allowedWorkItemIds = nodes.flatMap((node) => [
    node.executionAction.workItemId!,
    node.resumeAction.workItemId!
  ]);
  const guardConfig: GuardConfig = {
    candidateVersion,
    projectionIdentity,
    review: {
      result: "PRE_LOOP_REVIEW_PASSED",
      candidateVersion,
      projectionIdentity
    },
    nativeStartPaths: [
      {
        host: "codex",
        sourceKind: "codex-user-prompt-submit",
        command: startCommand
      }
    ],
    policy: {
      taskMode: "change",
      controlLevel: "hard-lock",
      executionState: "active",
      allowedWorkItemIds,
      allowedPaths: ["src/**"],
      dependencyPolicy: "deny",
      allowedDependencies: [],
      hashPolicy: "deny",
      allowedHashConsumerIds: [],
      agentBudget: 0,
      agentsUsed: 0,
      allowedTestIds: [],
      retryBudget: 1,
      allowedNetworkTargets: [],
      allowedExternalWriteTargets: [],
      deliveryAllowed: false
    }
  };
  const guard = new Guard(guardConfig);
  const permit = guard.mintPermit({
    permitId: "PERMIT-C5",
    candidateVersion,
    projectionIdentity,
    issuedAt: "2026-09-05T01:00:00+08:00",
    expiresAt: "2026-09-06T01:00:00+08:00",
    nativeStart: {
      ...guardConfig.nativeStartPaths[0]!,
      actor: "user",
      adapterVerified: true,
      evidenceId: "NATIVE-C5"
    }
  });
  const projection: RunnerContractProjection = {
    candidateVersion,
    projectionIdentity,
    status: options.contractStatus ?? "CLOSED",
    nodes
  };
  const runner = new MajorLoopRunner(
    projection,
    {
      ledger,
      guard,
      now: () => "2026-09-05T03:00:00+08:00",
      executeNode,
      diagnoseFailure: (failureEvidenceId) =>
        options.diagnoseFailure?.(failureEvidenceId) ?? stoppedDiagnostic(failureEvidenceId)
    },
    "RUNNER-C5"
  );
  return { runner, ledger, permit };
};

test("C5 executes only one dependency-ready node per run and closes it from evidence", () => {
  const nodes = [runnerNode("A"), runnerNode("B", ["A"])];
  const executed: string[] = [];
  const { runner, ledger, permit } = setup(nodes, (node) => {
    executed.push(node.nodeId);
    return completed(node);
  });

  const premature = runner.run("B", permit);
  assert.equal(premature.reasonCode, "DEPENDENCY_NOT_CLOSED");
  assert.deepEqual(executed, []);

  const first = runner.run("A", permit);
  assert.equal(first.outcome, "closed");
  assert.deepEqual(executed, ["A"]);
  assert.equal(ledger.replay().nodes.B?.status, "PENDING");

  const second = runner.run("B", permit);
  assert.equal(second.outcome, "closed");
  assert.deepEqual(executed, ["A", "B"]);
  assert.equal(ledger.replay().nodes.A?.status, "CLOSED");
  assert.equal(ledger.replay().nodes.B?.status, "CLOSED");
});

test("C5 rejects missing and expired permits without invoking the node executor", () => {
  let executions = 0;
  const { runner, ledger, permit } = setup([runnerNode("A")], (node) => {
    executions += 1;
    return completed(node);
  });

  assert.equal(runner.run("A", null).reasonCode, "PERMIT_REQUIRED");
  const expired = structuredClone(permit);
  expired.expiresAt = "2026-09-05T02:00:00+08:00";
  assert.equal(runner.run("A", expired).reasonCode, "PERMIT_EXPIRED");
  assert.equal(executions, 0);
  assert.equal(ledger.replay().nodes.A?.status, "PENDING");
  assert.deepEqual(
    ledger.replay().actions.map((entry) => entry.outcome),
    ["denied", "denied"]
  );
});

test("C5 refuses execution until the contract projection is closed", () => {
  let executions = 0;
  const { runner, ledger, permit } = setup(
    [runnerNode("A")],
    (node) => {
      executions += 1;
      return completed(node);
    },
    { contractStatus: "OPEN" }
  );

  assert.equal(runner.run("A", permit).reasonCode, "CONTRACT_NOT_CLOSED");
  assert.equal(executions, 0);
  assert.equal(ledger.replay().nodes.A?.status, "PENDING");
});

test("C5 prevents a second node from starting while one awaits acceptance", () => {
  const first = runnerNode("A");
  const second = runnerNode("B");
  let executions = 0;
  const { runner, ledger, permit } = setup([first, second], (node) => {
    executions += 1;
    return completed(node, false);
  });

  assert.equal(runner.run("A", permit).outcome, "awaiting-acceptance");
  assert.equal(ledger.replay().nodes.A?.status, "AWAITING_ACCEPTANCE");
  assert.equal(runner.run("B", permit).reasonCode, "ANOTHER_NODE_IS_ACTIVE");
  assert.equal(executions, 1);
});

test("C5 records a checkpoint, pauses, revalidates recovery, and honors stop", () => {
  const node = runnerNode("A");
  const { runner, ledger, permit } = setup([node], () => ({
    outcome: "paused",
    evidence: [],
    acceptance: null
  }));

  const paused = runner.run("A", permit);
  assert.equal(paused.outcome, "paused");
  assert.ok(paused.checkpointId);
  assert.equal(ledger.replay().nodes.A?.status, "PAUSED");
  assert.equal(Object.keys(ledger.replay().checkpoints).length, 1);

  const authority = {
    verified: true as const,
    authority: "direct-user" as const,
    source: "User selected resume from the visible checkpoint."
  };
  assert.equal(runner.resume("A", null, authority).reasonCode, "PERMIT_REQUIRED");
  assert.equal(ledger.replay().nodes.A?.status, "PAUSED");

  const recovered = runner.resume("A", permit, authority);
  assert.equal(recovered.outcome, "recovered");
  assert.equal(recovered.nodeStatus, "RUNNING");
  assert.equal(ledger.replay().recoveries.length, 1);

  const stopped = runner.stop("A", {
    verified: true,
    authority: "direct-user",
    source: "User said stop."
  });
  assert.equal(stopped.outcome, "cancelled");
  assert.equal(ledger.replay().nodes.A?.status, "CANCELLED");
});

test("C5 makes a direct stop effective without a major-loop permit", () => {
  let executions = 0;
  const { runner, ledger } = setup([runnerNode("A")], (node) => {
    executions += 1;
    return completed(node);
  });

  const stopped = runner.stop("A", {
    verified: true,
    authority: "direct-user",
    source: "User stopped before execution."
  });
  assert.equal(stopped.outcome, "cancelled");
  assert.equal(ledger.replay().nodes.A?.status, "CANCELLED");
  assert.equal(executions, 0);
});

test("C5 rejects recovery from WAITING_CONTRACT_CHANGE under the old candidate", () => {
  const { runner, ledger, permit } = setup([runnerNode("A")], () => ({
    outcome: "waiting-contract-change",
    evidence: [],
    acceptance: null
  }));
  runner.run("A", permit);

  const outcome = runner.resume("A", permit, {
    verified: true,
    authority: "direct-user",
    source: "Try to continue without revising."
  });
  assert.equal(outcome.reasonCode, "NODE_NOT_RECOVERABLE");
  assert.equal(ledger.replay().nodes.A?.status, "WAITING_CONTRACT_CHANGE");
});

test("C5 records budget exhaustion without executing or consuming another run", () => {
  const node = runnerNode("A");
  node.budget.normalRuns = 0;
  let executions = 0;
  const { runner, ledger, permit } = setup([node], (current) => {
    executions += 1;
    return completed(current);
  });

  const outcome = runner.run("A", permit);
  assert.equal(outcome.reasonCode, "NORMAL_RUN_BUDGET_EXHAUSTED");
  assert.equal(executions, 0);
  assert.equal(ledger.replay().nodes.A?.status, "PENDING");
  assert.equal(ledger.replay().actions[0]?.outcome, "denied");
});

test("C5 routes failed evidence to the bounded C6 diagnostic dependency", () => {
  const node = runnerNode("A");
  let diagnosed = "";
  const { runner, ledger, permit } = setup(
    [node],
    () => ({
      outcome: "failed",
      evidence: [
        {
          id: "E-A-FAIL",
          criterionId: "A-ORACLE",
          commandOrAction: "A-A-run",
          result: "failed",
          observation: "A deterministic failure occurred.",
          environmentIdentity: node.environmentIdentity,
          executedBy: "automated-oracle"
        }
      ],
      acceptance: null
    }),
    {
      diagnoseFailure: (failureEvidenceId) => {
        diagnosed = failureEvidenceId;
        return stoppedDiagnostic(failureEvidenceId);
      }
    }
  );

  const outcome = runner.run("A", permit);
  assert.equal(outcome.outcome, "failed");
  assert.equal(diagnosed, "E-A-FAIL");
  assert.equal(outcome.diagnosticOutcome?.reasonCode, "NO_DISCRIMINATING_PROBE");
  assert.equal(ledger.replay().nodes.A?.status, "FAILED");
  assert.equal(ledger.replay().evidence["E-A-FAIL"]?.result, "failed");
});

test("C5 turns an executor exception into failure evidence and stops in diagnostics", () => {
  const { runner, ledger, permit } = setup([runnerNode("A")], () => {
    throw new Error("executor exploded");
  });

  const outcome = runner.run("A", permit);
  assert.equal(outcome.outcome, "failed");
  assert.match(Object.values(ledger.replay().evidence)[0]?.observation ?? "", /executor exploded/);
  assert.equal(ledger.replay().nodes.A?.status, "FAILED");
});
