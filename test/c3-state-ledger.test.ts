import assert from "node:assert/strict";
import test from "node:test";

import {
  StateLedger,
  StateLedgerError,
  type AcceptanceRecordedEvent,
  type ActionRecordedEvent,
  type CheckpointRecordedEvent,
  type EvidenceInvalidatedEvent,
  type EvidenceRecordedEvent,
  type LedgerActor,
  type LedgerEvent,
  type NodeStatus,
  type NodeTransitionedEvent,
  type RecoveryRecordedEvent,
  type StateLedgerConfig
} from "../src/index.js";

const candidateVersion = "2026-09-04.30";
const implementationIdentity = "bootstrap-2026-09-04.30/C3/1";
const environmentIdentity = "windows-node-24.11.1";

const config = (): StateLedgerConfig => ({
  candidateVersion,
  nodeIds: ["M2", "C3"]
});

const base = (
  sequence: number,
  actor: LedgerActor = "agent",
  nodeId = "C3",
  identity: string | null = implementationIdentity
) => ({
  eventId: `EV-${sequence}`,
  candidateVersion,
  sequence,
  occurredAt: `2026-09-05T01:${String(sequence).padStart(2, "0")}:00+08:00`,
  actor,
  nodeId,
  implementationIdentity: identity
});

const transition = (
  sequence: number,
  from: NodeStatus,
  to: NodeStatus,
  identity: string | null = implementationIdentity
): NodeTransitionedEvent => ({
  ...base(sequence, "agent", "C3", identity),
  kind: "node-transitioned",
  from,
  to,
  reason: `${from} to ${to}`
});

const action = (sequence: number): ActionRecordedEvent => ({
  ...base(sequence),
  kind: "action-recorded",
  action: {
    id: "A-C3-VERIFY",
    category: "test",
    description: "Run the C3 acceptance oracle once.",
    target: "C3",
    outcome: "completed"
  }
});

const evidence = (
  sequence: number,
  id = "E-C3-VERIFY",
  environment = environmentIdentity
): EvidenceRecordedEvent => ({
  ...base(sequence, "automated-oracle"),
  kind: "evidence-recorded",
  evidence: {
    id,
    criterionId: "C3-ORACLE",
    commandOrAction: "pnpm verify --node C3",
    result: "passed",
    observation: "The state ledger acceptance cases passed.",
    environmentIdentity: environment,
    executedBy: "automated-oracle"
  }
});

const invalidate = (sequence: number, evidenceId = "E-C3-VERIFY"): EvidenceInvalidatedEvent => ({
  ...base(sequence),
  kind: "evidence-invalidated",
  evidenceId,
  reason: "The bound environment changed."
});

const acceptance = (
  sequence: number,
  verdict: "accepted" | "rejected" = "accepted",
  environment = environmentIdentity
): AcceptanceRecordedEvent => ({
  ...base(sequence, "automated-oracle"),
  kind: "acceptance-recorded",
  verdict,
  evidenceIds: ["E-C3-VERIFY"],
  environmentIdentity: environment,
  reason: verdict === "accepted" ? "The C3 oracle passed." : "The C3 oracle rejected the node."
});

const checkpoint = (sequence: number): CheckpointRecordedEvent => ({
  ...base(sequence),
  kind: "checkpoint-recorded",
  checkpointId: "CP-C3-RUNNING",
  environmentIdentity,
  summary: "C3 was running with its current implementation identity."
});

const recovery = (sequence: number): RecoveryRecordedEvent => ({
  ...base(sequence, "guard"),
  kind: "recovery-recorded",
  checkpointId: "CP-C3-RUNNING",
  authorization: {
    verified: true,
    authority: "contract",
    source: "M2 unattended recovery branch",
    candidateVersion,
    nodeId: "C3",
    implementationIdentity,
    checkpointId: "CP-C3-RUNNING"
  },
  reason: "Resume the approved checkpoint."
});

const appendAll = (ledger: StateLedger, events: LedgerEvent[]): void => {
  for (const event of events) ledger.append(event);
};

const runningLedger = (): StateLedger => {
  const ledger = new StateLedger(config());
  appendAll(ledger, [transition(1, "PENDING", "READY"), transition(2, "READY", "RUNNING")]);
  return ledger;
};

const expectLedgerFailure = (operation: () => unknown, expected: RegExp): void => {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof StateLedgerError);
    assert.match(error.message, expected);
    return true;
  });
};

test("C3 projects a legal lifecycle with actions, evidence, and an acceptance verdict", () => {
  const ledger = runningLedger();
  appendAll(ledger, [
    action(3),
    evidence(4),
    transition(5, "RUNNING", "AWAITING_ACCEPTANCE"),
    acceptance(6)
  ]);

  const view = ledger.replay();
  assert.equal(view.nodes.C3?.status, "CLOSED");
  assert.equal(view.actions[0]?.id, "A-C3-VERIFY");
  assert.equal(view.evidence["E-C3-VERIFY"]?.valid, true);
  assert.equal(view.verdicts[0]?.verdict, "accepted");
  assert.equal(view.verdicts[0]?.valid, true);
});

test("C3 replays the same state after serialization and context replacement", () => {
  const ledger = runningLedger();
  appendAll(ledger, [checkpoint(3), action(4), transition(5, "RUNNING", "PAUSED")]);

  const serialized = JSON.stringify(ledger.events());
  const restored = new StateLedger(config(), JSON.parse(serialized));

  assert.deepEqual(restored.replay(), ledger.replay());
  assert.deepEqual(restored.events(), ledger.events());
});

test("C3 rejects an illegal transition atomically", () => {
  const ledger = new StateLedger(config());

  expectLedgerFailure(
    () => ledger.append(transition(1, "PENDING", "RUNNING")),
    /illegal transition.*PENDING -> RUNNING/
  );
  assert.equal(ledger.replay().nodes.C3?.status, "PENDING");
  assert.equal(ledger.events().length, 0);
});

test("C3 rejects out-of-order, wrong-version, and unknown-node events", () => {
  const ledger = new StateLedger(config());

  expectLedgerFailure(() => ledger.append(transition(2, "PENDING", "READY")), /sequence must be 1/);

  const wrongVersion = transition(1, "PENDING", "READY");
  wrongVersion.candidateVersion = "2026-09-04.29";
  expectLedgerFailure(() => ledger.append(wrongVersion), /candidate .* does not match/);

  const unknownNode = transition(1, "PENDING", "READY");
  unknownNode.nodeId = "C404";
  expectLedgerFailure(() => ledger.append(unknownNode), /unknown node C404/);
  assert.equal(ledger.events().length, 0);
});

test("C3 rejects stale evidence during acceptance", () => {
  const ledger = runningLedger();
  appendAll(ledger, [
    evidence(3),
    transition(4, "RUNNING", "AWAITING_ACCEPTANCE"),
    invalidate(5)
  ]);

  expectLedgerFailure(() => ledger.append(acceptance(6)), /references stale evidence E-C3-VERIFY/);
  assert.equal(ledger.replay().nodes.C3?.status, "AWAITING_ACCEPTANCE");
  assert.equal(ledger.events().length, 5);
});

test("C3 rejects evidence whose environment binding is stale", () => {
  const ledger = runningLedger();
  appendAll(ledger, [evidence(3), transition(4, "RUNNING", "AWAITING_ACCEPTANCE")]);

  expectLedgerFailure(
    () => ledger.append(acceptance(5, "accepted", "different-environment")),
    /has a stale binding/
  );
});

test("C3 invalidates a dependent verdict and reopens its node", () => {
  const ledger = runningLedger();
  appendAll(ledger, [
    evidence(3),
    transition(4, "RUNNING", "AWAITING_ACCEPTANCE"),
    acceptance(5),
    invalidate(6)
  ]);

  const view = ledger.replay();
  assert.equal(view.nodes.C3?.status, "READY");
  assert.equal(view.evidence["E-C3-VERIFY"]?.valid, false);
  assert.equal(view.verdicts[0]?.valid, false);
  assert.equal(view.verdicts[0]?.invalidatedBy, "EV-6");
});

test("C3 restores an authorized recovery to the bound checkpoint", () => {
  const ledger = runningLedger();
  appendAll(ledger, [
    checkpoint(3),
    transition(4, "RUNNING", "PAUSED"),
    recovery(5)
  ]);

  const view = ledger.replay();
  assert.equal(view.nodes.C3?.status, "RUNNING");
  assert.equal(view.recoveries[0]?.from, "PAUSED");
  assert.equal(view.recoveries[0]?.to, "RUNNING");
  assert.equal(view.recoveries[0]?.checkpointId, "CP-C3-RUNNING");
});

test("C3 rejects an unverified or mismatched recovery authorization", () => {
  const ledger = runningLedger();
  appendAll(ledger, [checkpoint(3), transition(4, "RUNNING", "PAUSED")]);

  const unverified = recovery(5);
  (unverified.authorization as unknown as { verified: boolean }).verified = false;
  expectLedgerFailure(() => ledger.append(unverified), /is not authorized/);

  const wrongTarget = recovery(5);
  wrongTarget.authorization.nodeId = "M2";
  expectLedgerFailure(() => ledger.append(wrongTarget), /does not match its bound target/);
  assert.equal(ledger.replay().nodes.C3?.status, "PAUSED");
});

test("C3 does not recover a contract-change wait under the stale candidate", () => {
  const ledger = runningLedger();
  appendAll(ledger, [checkpoint(3), transition(4, "RUNNING", "WAITING_CONTRACT_CHANGE")]);

  expectLedgerFailure(() => ledger.append(recovery(5)), /cannot recover from WAITING_CONTRACT_CHANGE/);
});

test("C3 records rejection as a verdict and a FAILED state", () => {
  const ledger = runningLedger();
  appendAll(ledger, [
    evidence(3),
    transition(4, "RUNNING", "AWAITING_ACCEPTANCE"),
    acceptance(5, "rejected")
  ]);

  const view = ledger.replay();
  assert.equal(view.nodes.C3?.status, "FAILED");
  assert.equal(view.verdicts[0]?.verdict, "rejected");
});

test("C3 rejects duplicate evidence identities", () => {
  const ledger = runningLedger();
  ledger.append(evidence(3));

  expectLedgerFailure(() => ledger.append(evidence(4)), /evidence id is duplicated/);
  assert.equal(Object.keys(ledger.replay().evidence).length, 1);
});
// SPDX-License-Identifier: MPL-2.0
