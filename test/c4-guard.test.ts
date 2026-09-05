import assert from "node:assert/strict";
import test from "node:test";

import {
  Guard,
  PermitIssuanceError,
  withHostEffect,
  withHumanFeedback,
  type GuardAction,
  type GuardConfig,
  type GuardDecisionContext,
  type MajorLoopPermit,
  type PermitRequest
} from "../src/index.js";

const candidateVersion = "2026-09-04.30";
const projectionIdentity = "projection-2026-09-04.30/1";
const startCommand = "$major-loop-runner start candidate=2026-09-04.30";

const guardConfig = (): GuardConfig => ({
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
    allowedWorkItemIds: [
      "W-READ",
      "W-WRITE",
      "W-HASH",
      "W-DEPENDENCY",
      "W-DELEGATE",
      "W-TEST",
      "W-NETWORK",
      "W-EXTERNAL",
      "W-DELIVERY"
    ],
    allowedPaths: ["src/**", "package.json"],
    dependencyPolicy: "deny",
    allowedDependencies: ["ajv"],
    hashPolicy: "deny",
    allowedHashConsumerIds: ["C12-release-integrity"],
    agentBudget: 1,
    agentsUsed: 0,
    allowedTestIds: ["C4-acceptance"],
    retryBudget: 1,
    allowedNetworkTargets: ["registry.npmjs.org"],
    allowedExternalWriteTargets: ["github.com/example/AsYouMeant"],
    deliveryAllowed: false
  }
});

const permitRequest = (): PermitRequest => ({
  permitId: "PERMIT-1",
  candidateVersion,
  projectionIdentity,
  issuedAt: "2026-09-05T01:00:00+08:00",
  expiresAt: "2026-09-06T01:00:00+08:00",
  nativeStart: {
    host: "codex",
    sourceKind: "codex-user-prompt-submit",
    command: startCommand,
    actor: "user",
    adapterVerified: true,
    evidenceId: "NATIVE-START-1"
  }
});

const requestedBasis = () => ({ kind: "requested" as const, requirementIds: ["R3"] });

const action = (): GuardAction => ({
  id: "A-WRITE",
  workItemId: "W-WRITE",
  kind: "write",
  mutability: "write",
  basis: requestedBasis(),
  targetPaths: ["src/guard/guard.ts"],
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

const context = (
  nextAction: GuardAction,
  permit: MajorLoopPermit | null,
  phase: GuardDecisionContext["phase"] = "major-loop"
): GuardDecisionContext => ({
  phase,
  now: "2026-09-05T02:00:00+08:00",
  permit,
  action: nextAction
});

const configuredGuard = (config = guardConfig()): { guard: Guard; permit: MajorLoopPermit } => {
  const guard = new Guard(config);
  return { guard, permit: guard.mintPermit(permitRequest()) };
};

test("C4 mints a permit only from the exact reviewed native user path", () => {
  const guard = new Guard(guardConfig());
  const permit = guard.mintPermit(permitRequest());

  assert.equal(permit.status, "active");
  assert.equal(permit.nativeStart.sourceKind, "codex-user-prompt-submit");

  const modelIssued = permitRequest();
  (modelIssued.nativeStart as unknown as { actor: string }).actor = "agent";
  assert.throws(() => guard.mintPermit(modelIssued), PermitIssuanceError);

  const approximateCommand = permitRequest();
  approximateCommand.nativeStart.command = "please start the major loop";
  assert.throws(
    () => guard.mintPermit(approximateCommand),
    /command and source do not match an approved native path/
  );
});

test("C4 refuses permit issuance when the pre-loop review is not passed", () => {
  const config = guardConfig();
  config.review.result = "PRE_LOOP_REVIEW_FAILED";
  const guard = new Guard(config);

  assert.throws(() => guard.mintPermit(permitRequest()), /pre-loop review did not pass/);
});

test("C4 hard-locks a mapped mutation before formal start", () => {
  const guard = new Guard(guardConfig());
  const decision = guard.decide(context(action(), null, "pre-start"));

  assert.equal(decision.outcome, "deny");
  assert.equal(decision.reasonCode, "PRE_START_HARD_LOCK");
  assert.equal(decision.runtimeEvidence.ledgerOutcome, "denied");
});

test("C4 rejects an unmapped action even when a valid permit exists", () => {
  const { guard, permit } = configuredGuard();
  const unmapped = action();
  unmapped.workItemId = null;

  const decision = guard.decide(context(unmapped, permit));
  assert.equal(decision.outcome, "deny");
  assert.equal(decision.reasonCode, "UNMAPPED_ACTION");
});

test("C4 rejects a missing, expired, or rebound permit", () => {
  const { guard, permit } = configuredGuard();

  assert.equal(guard.decide(context(action(), null)).reasonCode, "PERMIT_REQUIRED");

  const expired = structuredClone(permit);
  expired.expiresAt = "2026-09-05T01:30:00+08:00";
  assert.equal(guard.decide(context(action(), expired)).reasonCode, "PERMIT_EXPIRED");

  const rebound = structuredClone(permit);
  rebound.candidateVersion = "2026-09-04.29";
  assert.equal(guard.decide(context(action(), rebound)).reasonCode, "PERMIT_BINDING_INVALID");
});

test("C4 pairs scope-creep rejection with requested and necessary work", () => {
  const { guard, permit } = configuredGuard();
  const bad = action();
  bad.basis = { kind: "unapproved-expansion" };
  const denied = guard.decide(context(bad, permit));
  assert.equal(denied.outcome, "deny");
  assert.equal(denied.category, "scope-creep");

  const requested = guard.decide(context(action(), permit));
  assert.equal(requested.outcome, "allow");

  const necessary = action();
  necessary.basis = {
    kind: "necessary-consequence",
    consumerIds: ["C4"],
    reachableEvidenceIds: ["E-C4-COMPILE"],
    omissionFailsAcceptance: true
  };
  assert.equal(guard.decide(context(necessary, permit)).outcome, "allow");

  necessary.basis.reachableEvidenceIds = [];
  assert.equal(guard.decide(context(necessary, permit)).reasonCode, "STOP_LADDER_UNSATISFIED");
});

test("C4 pairs unauthorized hashing and hypothetical hardening with reachable allowed work", () => {
  const deniedSetup = configuredGuard();
  const hashAction = action();
  hashAction.id = "A-HASH";
  hashAction.workItemId = "W-HASH";
  hashAction.kind = "hash";
  hashAction.hashConsumerId = "C12-release-integrity";
  const denied = deniedSetup.guard.decide(context(hashAction, deniedSetup.permit));
  assert.equal(denied.outcome, "deny");
  assert.equal(denied.category, "hashing-or-hypothetical-hardening");

  const allowedConfig = guardConfig();
  allowedConfig.policy.hashPolicy = "allow";
  const allowedSetup = configuredGuard(allowedConfig);
  assert.equal(allowedSetup.guard.decide(context(hashAction, allowedSetup.permit)).outcome, "allow");

  const hypothetical = action();
  hypothetical.hardening = true;
  hypothetical.reachability = "unreachable";
  assert.equal(
    deniedSetup.guard.decide(context(hypothetical, deniedSetup.permit)).reasonCode,
    "HYPOTHETICAL_HARDENING"
  );

  hypothetical.reachability = "reachable";
  assert.equal(deniedSetup.guard.decide(context(hypothetical, deniedSetup.permit)).outcome, "allow");
});

test("C4 pairs intent-violating mutation with a read-only action", () => {
  const config = guardConfig();
  config.policy.taskMode = "review";
  const { guard, permit } = configuredGuard(config);

  const denied = guard.decide(context(action(), permit));
  assert.equal(denied.outcome, "deny");
  assert.equal(denied.category, "intent-violation");

  const read = action();
  read.id = "A-READ";
  read.workItemId = "W-READ";
  read.kind = "read";
  read.mutability = "read";
  read.targetPaths = [];
  assert.equal(guard.decide(context(read, null)).outcome, "allow");
});

test("C4 pairs task-thrashing rejection with a newly required acceptance test", () => {
  const { guard, permit } = configuredGuard();
  const testAction = action();
  testAction.id = "A-TEST";
  testAction.workItemId = "W-TEST";
  testAction.kind = "test";
  testAction.test = {
    testId: "C4-acceptance",
    classification: "acceptance",
    consumerNodeId: "C4",
    implementationIdentity: "bootstrap-2026-09-04.30/C4/1",
    hasEquivalentValidEvidence: true,
    relevantChange: false,
    contractRequiresRepeat: false,
    failureEvidenceId: null,
    hypothesisIds: [],
    discriminating: false
  };

  const denied = guard.decide(context(testAction, permit));
  assert.equal(denied.outcome, "deny");
  assert.equal(denied.category, "task-thrashing");
  assert.equal(denied.reasonCode, "EQUIVALENT_TEST_EVIDENCE_EXISTS");

  testAction.test.relevantChange = true;
  assert.equal(guard.decide(context(testAction, permit)).outcome, "allow");
});

test("C4 stops exploratory diagnostics and retries without a new basis", () => {
  const { guard, permit } = configuredGuard();
  const testAction = action();
  testAction.workItemId = "W-TEST";
  testAction.kind = "test";
  testAction.test = {
    testId: "C4-acceptance",
    classification: "diagnostic",
    consumerNodeId: "C4",
    implementationIdentity: "bootstrap-2026-09-04.30/C4/1",
    hasEquivalentValidEvidence: false,
    relevantChange: false,
    contractRequiresRepeat: false,
    failureEvidenceId: null,
    hypothesisIds: [],
    discriminating: false
  };
  assert.equal(guard.decide(context(testAction, permit)).reasonCode, "DIAGNOSTIC_BASIS_INCOMPLETE");

  testAction.test.classification = "exploratory-repeated";
  assert.equal(guard.decide(context(testAction, permit)).reasonCode, "EXPLORATORY_TEST_REJECTED");

  const retry = action();
  retry.retry = {
    attempt: 1,
    newEvidenceIds: [],
    relatedImplementationChanged: false,
    environmentInvalidated: false
  };
  assert.equal(guard.decide(context(retry, permit)).reasonCode, "RETRY_HAS_NO_NEW_BASIS");
});

test("C4 enforces file, dependency, delegation, network, external-write, delivery, and privilege bounds", () => {
  const { guard, permit } = configuredGuard();

  const outsidePath = action();
  outsidePath.targetPaths = ["../outside.ts"];
  assert.equal(guard.decide(context(outsidePath, permit)).reasonCode, "PATH_OUTSIDE_CONTRACT");

  const dependency = action();
  dependency.workItemId = "W-DEPENDENCY";
  dependency.kind = "dependency";
  dependency.targetPaths = ["package.json"];
  dependency.dependencyNames = ["ajv"];
  assert.equal(guard.decide(context(dependency, permit)).reasonCode, "DEPENDENCY_NOT_AUTHORIZED");

  const delegation = action();
  delegation.workItemId = "W-DELEGATE";
  delegation.kind = "delegate";
  delegation.mutability = "read";
  delegation.targetPaths = [];
  delegation.delegationCount = 1;
  delegation.boundedDelegation = false;
  assert.equal(guard.decide(context(delegation, permit)).reasonCode, "UNBOUNDED_DELEGATION");

  const network = action();
  network.workItemId = "W-NETWORK";
  network.kind = "network";
  network.mutability = "read";
  network.targetPaths = [];
  network.networkTargets = ["example.invalid"];
  assert.equal(guard.decide(context(network, permit)).reasonCode, "NETWORK_NOT_AUTHORIZED");

  const external = action();
  external.workItemId = "W-EXTERNAL";
  external.kind = "external-write";
  external.externalWriteTargets = ["github.com/other/repo"];
  assert.equal(guard.decide(context(external, permit)).reasonCode, "EXTERNAL_WRITE_NOT_AUTHORIZED");

  const delivery = action();
  delivery.workItemId = "W-DELIVERY";
  delivery.kind = "delivery";
  delivery.mutability = "read";
  delivery.targetPaths = [];
  assert.equal(guard.decide(context(delivery, permit)).reasonCode, "DELIVERY_NOT_AUTHORIZED");

  const expansion = action();
  expansion.privilegeExpansion = true;
  assert.equal(guard.decide(context(expansion, permit)).reasonCode, "PRIVILEGE_EXPANSION");
});

test("C4 allows exact good cases for bounded project capabilities", () => {
  const config = guardConfig();
  config.policy.dependencyPolicy = "allow";
  config.policy.deliveryAllowed = true;
  const { guard, permit } = configuredGuard(config);

  const dependency = action();
  dependency.workItemId = "W-DEPENDENCY";
  dependency.kind = "dependency";
  dependency.targetPaths = ["package.json"];
  dependency.dependencyNames = ["ajv"];

  const delegation = action();
  delegation.workItemId = "W-DELEGATE";
  delegation.kind = "delegate";
  delegation.mutability = "read";
  delegation.targetPaths = [];
  delegation.delegationCount = 1;

  const network = action();
  network.workItemId = "W-NETWORK";
  network.kind = "network";
  network.mutability = "read";
  network.targetPaths = [];
  network.networkTargets = ["registry.npmjs.org"];

  const external = action();
  external.workItemId = "W-EXTERNAL";
  external.kind = "external-write";
  external.externalWriteTargets = ["github.com/example/AsYouMeant"];

  const delivery = action();
  delivery.workItemId = "W-DELIVERY";
  delivery.kind = "delivery";
  delivery.mutability = "read";
  delivery.targetPaths = [];

  for (const good of [dependency, delegation, network, external, delivery]) {
    assert.equal(guard.decide(context(good, permit)).outcome, "allow");
  }
});

test("C4 distinguishes observation, guard, hard-lock, and off levels", () => {
  const base = action();
  base.basis = { kind: "unapproved-expansion" };

  const observationConfig = guardConfig();
  observationConfig.policy.controlLevel = "observation";
  const observation = configuredGuard(observationConfig);
  assert.equal(observation.guard.decide(context(base, observation.permit)).outcome, "observe");

  const uncertain = action();
  uncertain.mutability = "unknown";
  const guardConfigValue = guardConfig();
  guardConfigValue.policy.taskMode = "review";
  guardConfigValue.policy.controlLevel = "guard";
  const guarded = configuredGuard(guardConfigValue);
  assert.equal(guarded.guard.decide(context(uncertain, guarded.permit)).outcome, "observe");

  const hardLockConfig = structuredClone(guardConfigValue);
  hardLockConfig.policy.controlLevel = "hard-lock";
  const hardLocked = configuredGuard(hardLockConfig);
  assert.equal(hardLocked.guard.decide(context(uncertain, hardLocked.permit)).outcome, "deny");

  const offConfig = guardConfig();
  offConfig.policy.controlLevel = "off";
  const off = configuredGuard(offConfig);
  assert.equal(off.guard.decide(context(base, off.permit)).reasonCode, "CONTROL_OFF_WITHIN_CORE_CONTRACT");
});

test("C4 honors pause and stop before optional control levels", () => {
  const pausedConfig = guardConfig();
  pausedConfig.policy.controlLevel = "off";
  pausedConfig.policy.executionState = "paused";
  const paused = configuredGuard(pausedConfig);
  assert.equal(paused.guard.decide(context(action(), paused.permit)).reasonCode, "EXECUTION_PAUSED");

  const stoppedConfig = guardConfig();
  stoppedConfig.policy.executionState = "stopped";
  const stopped = configuredGuard(stoppedConfig);
  assert.equal(stopped.guard.decide(context(action(), stopped.permit)).reasonCode, "EXECUTION_STOPPED");
});

test("C4 keeps Guard and host effects separate and supports human labels", () => {
  const { guard, permit } = configuredGuard();
  const deniedAction = action();
  deniedAction.basis = { kind: "unapproved-expansion" };
  const decision = guard.decide(context(deniedAction, permit));

  assert.equal(decision.guardEffect, "denied");
  assert.deepEqual(decision.hostEffect, { outcome: "unobserved", evidenceId: null });

  const observedHost = withHostEffect(decision, "blocked", "HOST-HOOK-1");
  const labelled = withHumanFeedback(observedHost, "correct", "User label on HOST-HOOK-1");
  assert.deepEqual(labelled.hostEffect, { outcome: "blocked", evidenceId: "HOST-HOOK-1" });
  assert.deepEqual(labelled.feedback, {
    label: "correct",
    source: "User label on HOST-HOOK-1"
  });
  assert.deepEqual(decision.hostEffect, { outcome: "unobserved", evidenceId: null });
});
