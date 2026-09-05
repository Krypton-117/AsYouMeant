import { Guard, MajorLoopRunner, StateLedger } from "../dist/src/index.js";

const candidateVersion = "2026-09-04.30";
const projectionIdentity = "m2-demo-projection/1";
const startCommand = "$major-loop-runner start candidate=2026-09-04.30";
const now = "2026-09-05T03:00:00+08:00";

const action = (id, workItemId, kind) => ({
  id,
  workItemId,
  kind,
  mutability: "write",
  basis: { kind: "requested", requirementIds: ["R3", "R11"] },
  targetPaths: ["src/demo.ts"],
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

const runAction = action("A-DEMO-RUN", "W-DEMO-RUN", "write");
const resumeAction = action("A-DEMO-RESUME", "W-DEMO-RESUME", "control");
const guard = new Guard({
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
    allowedWorkItemIds: ["W-DEMO-RUN", "W-DEMO-RESUME"],
    allowedPaths: ["src/**"],
    dependencyPolicy: "deny",
    allowedDependencies: [],
    hashPolicy: "deny",
    allowedHashConsumerIds: [],
    agentBudget: 0,
    agentsUsed: 0,
    allowedTestIds: [],
    retryBudget: 0,
    allowedNetworkTargets: [],
    allowedExternalWriteTargets: [],
    deliveryAllowed: false
  }
});

const illegalStart = guard.decide({
  phase: "pre-start",
  now,
  permit: null,
  action: runAction
});
const permit = guard.mintPermit({
  permitId: "M2-DEMO-PERMIT",
  candidateVersion,
  projectionIdentity,
  issuedAt: "2026-09-05T02:00:00+08:00",
  expiresAt: "2026-09-06T02:00:00+08:00",
  nativeStart: {
    host: "codex",
    sourceKind: "codex-user-prompt-submit",
    command: startCommand,
    actor: "user",
    adapterVerified: true,
    evidenceId: "M2-DEMO-NATIVE-START"
  }
});

const ledger = new StateLedger({ candidateVersion, nodeIds: ["DEMO"] });
const node = {
  nodeId: "DEMO",
  implementationIdentity: "m2-demo/DEMO/1",
  environmentIdentity: "deterministic-demo",
  requiredNodeIds: [],
  executionAction: runAction,
  resumeAction,
  budget: {
    normalRuns: 1,
    diagnostic: { maxProbes: 0, maxCost: 0 },
    environmentRebuilds: 0
  }
};
const runner = new MajorLoopRunner(
  {
    candidateVersion,
    projectionIdentity,
    status: "CLOSED",
    nodes: [node]
  },
  {
    ledger,
    guard,
    now: () => now,
    executeNode: () => ({ outcome: "paused", evidence: [], acceptance: null }),
    diagnoseFailure: () => ({
      status: "stopped",
      reasonCode: "NO_FAILURE_IN_DEMO",
      reason: "The visible control demo did not fail.",
      next: "No diagnostic action is needed.",
      probeResult: null,
      guardDecision: null,
      remainingHypothesisIds: [],
      provenFix: null
    })
  },
  "M2-DEMO-RUNNER"
);

const paused = runner.run("DEMO", permit);
const controlAuthority = {
  verified: true,
  authority: "direct-user",
  source: "Visible M2 user recovery control"
};
const recovered = runner.resume("DEMO", permit, controlAuthority);
const stopped = runner.stop("DEMO", {
  verified: true,
  authority: "direct-user",
  source: "Visible M2 user stop control"
});

const rows = [
  ["非法启动", illegalStart.outcome.toUpperCase(), illegalStart.reasonCode],
  ["合法许可", permit.status.toUpperCase(), permit.nativeStart.sourceKind],
  ["检查点暂停", paused.nodeStatus, paused.checkpointId],
  ["授权恢复", recovered.nodeStatus, recovered.reasonCode],
  ["用户停止", stopped.nodeStatus, stopped.reasonCode]
];

console.log("AsYouMeant M2 可见演示");
for (const [label, state, evidence] of rows) {
  console.log(`${label}: ${state} | ${evidence}`);
}
console.log(`Guard/主机边界: ${illegalStart.guardEffect} / ${illegalStart.hostEffect.outcome}`);
