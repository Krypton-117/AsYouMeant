import assert from "node:assert/strict";
import test from "node:test";

import {
  DiagnosticKernel,
  DiagnosticKernelError,
  Guard,
  StateLedger,
  type DiagnosticCatalog,
  type DiagnosticHypothesis,
  type DiagnosticKernelDependencies,
  type DiagnosticProbe,
  type GuardAction,
  type GuardConfig,
  type LedgerEvidenceView,
  type MajorLoopPermit
} from "../src/index.js";

const candidateVersion = "2026-09-04.30";
const implementationIdentity = "bootstrap-2026-09-04.30/C5/1";
const environmentIdentity = "windows-node-24.11.1";
const failureId = "E-C5-FAILURE";

const failedEvidence = (): LedgerEvidenceView => {
  const ledger = new StateLedger({ candidateVersion, nodeIds: ["C5"] });
  ledger.append({
    eventId: "EV-1",
    candidateVersion,
    sequence: 1,
    occurredAt: "2026-09-05T02:00:00+08:00",
    actor: "agent",
    nodeId: "C5",
    implementationIdentity,
    kind: "node-transitioned",
    from: "PENDING",
    to: "READY",
    reason: "C5 inputs are ready."
  });
  ledger.append({
    eventId: "EV-2",
    candidateVersion,
    sequence: 2,
    occurredAt: "2026-09-05T02:01:00+08:00",
    actor: "agent",
    nodeId: "C5",
    implementationIdentity,
    kind: "node-transitioned",
    from: "READY",
    to: "RUNNING",
    reason: "C5 execution began."
  });
  ledger.append({
    eventId: "EV-3",
    candidateVersion,
    sequence: 3,
    occurredAt: "2026-09-05T02:02:00+08:00",
    actor: "automated-oracle",
    nodeId: "C5",
    implementationIdentity,
    kind: "evidence-recorded",
    evidence: {
      id: failureId,
      criterionId: "C5-RUN",
      commandOrAction: "pnpm verify --node C5",
      result: "failed",
      observation: "The contract parser rejected a valid field.",
      environmentIdentity,
      executedBy: "automated-oracle"
    }
  });
  const evidence = ledger.replay().evidence[failureId];
  assert.ok(evidence);
  return evidence;
};

const hypothesis = (id: string, defectId: string, path: string): DiagnosticHypothesis => ({
  id,
  failureEvidenceId: failureId,
  statement: `Hypothesis ${id}`,
  defect: {
    defectId,
    description: `Defect described by ${id}`,
    workItemId: "W-FIX-PROVEN-DEFECT",
    allowedTargetPaths: [path]
  }
});

const probeAction = (probeId: string, hypothesisIds: string[]): GuardAction => ({
  id: `A-${probeId}`,
  workItemId: "W-DIAGNOSTIC-PROBE",
  kind: "test",
  mutability: "read",
  basis: {
    kind: "necessary-consequence",
    consumerIds: ["C6"],
    reachableEvidenceIds: [failureId],
    omissionFailsAcceptance: true
  },
  targetPaths: [],
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
  test: {
    testId: probeId,
    classification: "diagnostic",
    consumerNodeId: "C6",
    implementationIdentity: "bootstrap-2026-09-04.30/C6/1",
    hasEquivalentValidEvidence: false,
    relevantChange: false,
    contractRequiresRepeat: false,
    failureEvidenceId: failureId,
    hypothesisIds,
    discriminating: true
  },
  retry: null,
  repeat: null
});

const probe = (
  id: string,
  predictions: Array<[string, string]>,
  cost = 1
): DiagnosticProbe => ({
  id,
  failureEvidenceId: failureId,
  cost,
  action: probeAction(
    id,
    predictions.map(([hypothesisId]) => hypothesisId)
  ),
  predictions: predictions.map(([hypothesisId, observationKey]) => ({
    hypothesisId,
    observationKey
  }))
});

const catalog = (
  hypotheses: DiagnosticHypothesis[],
  probes: DiagnosticProbe[],
  failures = [failedEvidence()]
): DiagnosticCatalog => ({ failures, hypotheses, probes, history: [] });

const guardSetup = (allowedTestIds: string[]): { guard: Guard; permit: MajorLoopPermit } => {
  const config: GuardConfig = {
    candidateVersion,
    projectionIdentity: "projection-2026-09-04.30/1",
    review: {
      result: "PRE_LOOP_REVIEW_PASSED",
      candidateVersion,
      projectionIdentity: "projection-2026-09-04.30/1"
    },
    nativeStartPaths: [
      {
        host: "codex",
        sourceKind: "codex-user-prompt-submit",
        command: "$major-loop-runner start candidate=2026-09-04.30"
      }
    ],
    policy: {
      taskMode: "change",
      controlLevel: "hard-lock",
      executionState: "active",
      allowedWorkItemIds: ["W-DIAGNOSTIC-PROBE"],
      allowedPaths: [],
      dependencyPolicy: "deny",
      allowedDependencies: [],
      hashPolicy: "deny",
      allowedHashConsumerIds: [],
      agentBudget: 0,
      agentsUsed: 0,
      allowedTestIds,
      retryBudget: 0,
      allowedNetworkTargets: [],
      allowedExternalWriteTargets: [],
      deliveryAllowed: false
    }
  };
  const guard = new Guard(config);
  const permit = guard.mintPermit({
    permitId: "PERMIT-C6",
    candidateVersion,
    projectionIdentity: config.projectionIdentity,
    issuedAt: "2026-09-05T01:00:00+08:00",
    expiresAt: "2026-09-06T01:00:00+08:00",
    nativeStart: {
      ...config.nativeStartPaths[0]!,
      actor: "user",
      adapterVerified: true,
      evidenceId: "NATIVE-C6"
    }
  });
  return { guard, permit };
};

const dependencies = (
  allowedTestIds: string[],
  observe: (probeId: string) => { key: string; evidenceIds: string[] }
): DiagnosticKernelDependencies => {
  const { guard, permit } = guardSetup(allowedTestIds);
  return {
    authorizeProbe: (selected) =>
      guard.decide({
        phase: "major-loop",
        now: "2026-09-05T03:00:00+08:00",
        permit,
        action: selected.action
      }),
    runProbe: (selected) => {
      const result = observe(selected.id);
      return {
        observationKey: result.key,
        observation: `Observed ${result.key}`,
        newEvidenceIds: result.evidenceIds,
        occurredAt: "2026-09-05T03:01:00+08:00"
      };
    }
  };
};

test("C6 runs one Guard-authorized discriminating probe and proves one root cause", () => {
  const hypotheses = [
    hypothesis("H-CONFIG", "D-CONFIG", "src/config.ts"),
    hypothesis("H-PARSER", "D-PARSER", "src/parser.ts")
  ];
  const probes = [probe("P-BOUNDARY", [["H-CONFIG", "CONFIG"], ["H-PARSER", "PARSER"]])];
  let runs = 0;
  const kernel = new DiagnosticKernel(
    catalog(hypotheses, probes),
    dependencies(["P-BOUNDARY"], () => {
      runs += 1;
      return { key: "CONFIG", evidenceIds: ["E-PROBE-CONFIG"] };
    })
  );

  const outcome = kernel.diagnose(failureId, { maxProbes: 1, maxCost: 1 });
  assert.equal(runs, 1);
  assert.equal(outcome.status, "root-cause-proven");
  assert.equal(outcome.remainingHypothesisIds[0], "H-CONFIG");
  assert.equal(outcome.provenFix?.defect.defectId, "D-CONFIG");
  assert.equal(outcome.guardDecision?.outcome, "allow");
});

test("C6 does not run without valid failure evidence, hypotheses, or a discriminating probe", () => {
  let runs = 0;
  const deps = dependencies(["P-SAME"], () => {
    runs += 1;
    return { key: "SAME", evidenceIds: ["E-SAME"] };
  });
  const hypotheses = [
    hypothesis("H-ONE", "D-ONE", "src/one.ts"),
    hypothesis("H-TWO", "D-TWO", "src/two.ts")
  ];
  const sameProbe = probe("P-SAME", [["H-ONE", "SAME"], ["H-TWO", "SAME"]]);

  const unknownFailure = new DiagnosticKernel(catalog(hypotheses, [sameProbe]), deps).diagnose(
    "E-UNKNOWN",
    { maxProbes: 1, maxCost: 1 }
  );
  assert.equal(unknownFailure.reasonCode, "FAILURE_EVIDENCE_REQUIRED");

  const noHypotheses = new DiagnosticKernel(catalog([], []), deps).diagnose(failureId, {
    maxProbes: 1,
    maxCost: 1
  });
  assert.equal(noHypotheses.reasonCode, "HYPOTHESES_REQUIRED");

  const noDistinction = new DiagnosticKernel(catalog(hypotheses, [sameProbe]), deps).diagnose(
    failureId,
    { maxProbes: 1, maxCost: 1 }
  );
  assert.equal(noDistinction.reasonCode, "NO_DISCRIMINATING_PROBE");
  assert.equal(runs, 0);
});

test("C6 selects maximum distinction, then lower cost and stable identity", () => {
  const hypotheses = [
    hypothesis("H-ONE", "D-ONE", "src/one.ts"),
    hypothesis("H-TWO", "D-TWO", "src/two.ts"),
    hypothesis("H-THREE", "D-THREE", "src/three.ts")
  ];
  const probes = [
    probe("P-TWO-WAYS", [["H-ONE", "A"], ["H-TWO", "A"], ["H-THREE", "B"]], 1),
    probe("P-THREE-WAYS", [["H-ONE", "A"], ["H-TWO", "B"], ["H-THREE", "C"]], 2)
  ];
  let selected = "";
  const kernel = new DiagnosticKernel(
    catalog(hypotheses, probes),
    dependencies(["P-TWO-WAYS", "P-THREE-WAYS"], (probeId) => {
      selected = probeId;
      return { key: "B", evidenceIds: ["E-MAX-DISTINCTION"] };
    })
  );

  kernel.diagnose(failureId, { maxProbes: 1, maxCost: 2 });
  assert.equal(selected, "P-THREE-WAYS");
});

test("C6 runs at most one probe per call and narrows before a later call", () => {
  const hypotheses = [
    hypothesis("H-ONE", "D-ONE", "src/one.ts"),
    hypothesis("H-TWO", "D-TWO", "src/two.ts"),
    hypothesis("H-THREE", "D-THREE", "src/three.ts")
  ];
  const probes = [
    probe("P-FIRST", [["H-ONE", "AB"], ["H-TWO", "AB"], ["H-THREE", "C"]]),
    probe("P-SECOND", [["H-ONE", "A"], ["H-TWO", "B"]])
  ];
  let runs = 0;
  const kernel = new DiagnosticKernel(
    catalog(hypotheses, probes),
    dependencies(["P-FIRST", "P-SECOND"], (probeId) => {
      runs += 1;
      return probeId === "P-FIRST"
        ? { key: "AB", evidenceIds: ["E-NARROW"] }
        : { key: "A", evidenceIds: ["E-PROVE"] };
    })
  );

  const first = kernel.diagnose(failureId, { maxProbes: 2, maxCost: 2 });
  assert.equal(first.status, "probe-completed");
  assert.deepEqual(first.remainingHypothesisIds, ["H-ONE", "H-TWO"]);
  assert.equal(runs, 1);

  const second = kernel.diagnose(failureId, { maxProbes: 2, maxCost: 2 });
  assert.equal(second.status, "root-cause-proven");
  assert.equal(second.remainingHypothesisIds[0], "H-ONE");
  assert.equal(runs, 2);
});

test("C6 stops at budget exhaustion without running a probe", () => {
  const hypotheses = [
    hypothesis("H-ONE", "D-ONE", "src/one.ts"),
    hypothesis("H-TWO", "D-TWO", "src/two.ts")
  ];
  const probes = [probe("P-BUDGET", [["H-ONE", "A"], ["H-TWO", "B"]])];
  let runs = 0;
  const kernel = new DiagnosticKernel(
    catalog(hypotheses, probes),
    dependencies(["P-BUDGET"], () => {
      runs += 1;
      return { key: "A", evidenceIds: ["E-BUDGET"] };
    })
  );

  const outcome = kernel.diagnose(failureId, { maxProbes: 0, maxCost: 0 });
  assert.equal(outcome.reasonCode, "DIAGNOSTIC_BUDGET_EXHAUSTED");
  assert.equal(runs, 0);
});

test("C6 never executes a probe that the Guard did not allow", () => {
  const hypotheses = [
    hypothesis("H-ONE", "D-ONE", "src/one.ts"),
    hypothesis("H-TWO", "D-TWO", "src/two.ts")
  ];
  const deniedProbe = probe("P-DENIED", [["H-ONE", "A"], ["H-TWO", "B"]]);
  deniedProbe.action.workItemId = null;
  let runs = 0;
  const kernel = new DiagnosticKernel(
    catalog(hypotheses, [deniedProbe]),
    dependencies(["P-DENIED"], () => {
      runs += 1;
      return { key: "A", evidenceIds: ["E-SHOULD-NOT-EXIST"] };
    })
  );

  const outcome = kernel.diagnose(failureId, { maxProbes: 1, maxCost: 1 });
  assert.equal(outcome.reasonCode, "PROBE_NOT_AUTHORIZED");
  assert.equal(outcome.guardDecision?.reasonCode, "UNMAPPED_ACTION");
  assert.equal(runs, 0);
});

test("C6 does not repeat a no-new-evidence path, including after reconstruction", () => {
  const hypotheses = [
    hypothesis("H-ONE", "D-ONE", "src/one.ts"),
    hypothesis("H-TWO", "D-TWO", "src/two.ts")
  ];
  const probes = [probe("P-NO-NEW", [["H-ONE", "A"], ["H-TWO", "B"]])];
  let runs = 0;
  const deps = dependencies(["P-NO-NEW"], () => {
    runs += 1;
    return { key: "A", evidenceIds: [] };
  });
  const kernel = new DiagnosticKernel(catalog(hypotheses, probes), deps);

  const first = kernel.diagnose(failureId, { maxProbes: 2, maxCost: 2 });
  assert.equal(first.reasonCode, "PROBE_PRODUCED_NO_NEW_EVIDENCE");
  assert.equal(kernel.diagnose(failureId, { maxProbes: 2, maxCost: 2 }).reasonCode, "NO_NEW_EVIDENCE_PATH_REJECTED");

  const restoredCatalog = catalog(hypotheses, probes);
  restoredCatalog.history = kernel.history();
  const restored = new DiagnosticKernel(restoredCatalog, deps);
  assert.equal(restored.diagnose(failureId, { maxProbes: 2, maxCost: 2 }).reasonCode, "NO_NEW_EVIDENCE_PATH_REJECTED");
  assert.equal(runs, 1);
});

test("C6 exposes a fix only for the uniquely proven defect", () => {
  const hypotheses = [
    hypothesis("H-ONE", "D-ONE", "src/one.ts"),
    hypothesis("H-TWO", "D-TWO", "src/two.ts")
  ];
  const probes = [probe("P-PROVE", [["H-ONE", "A"], ["H-TWO", "B"]])];
  const kernel = new DiagnosticKernel(
    catalog(hypotheses, probes),
    dependencies(["P-PROVE"], () => ({ key: "A", evidenceIds: ["E-PROOF"] }))
  );

  const outcome = kernel.diagnose(failureId, { maxProbes: 1, maxCost: 1 });
  assert.equal(outcome.status, "root-cause-proven");
  assert.equal(kernel.fixFor("H-ONE").defect.allowedTargetPaths[0], "src/one.ts");
  assert.throws(() => kernel.fixFor("H-TWO"), DiagnosticKernelError);
});
// SPDX-License-Identifier: MPL-2.0
