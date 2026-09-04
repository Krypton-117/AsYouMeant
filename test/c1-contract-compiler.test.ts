import assert from "node:assert/strict";
import test from "node:test";

import {
  compile,
  ContractCompilationError,
  matchIntent,
  type AcceptanceContract,
  type ContractCandidate,
  type ContractNode,
  type ExecutionPolicy,
  type PermissionDecision
} from "../src/index.js";

const decision = (
  state: PermissionDecision["state"] = "not-applicable",
  detail = "Not applicable to this fixture."
): PermissionDecision => ({ state, detail });

const execution = (): ExecutionPolicy => ({
  readinessBoundary: "Inputs and predecessors are closed.",
  sequencing: "serial",
  delegation: decision("not-permitted", "The fixture runs without delegation."),
  isolation: decision("allowed", "Only the fixture workspace is writable."),
  budget: {
    normalRuns: 1,
    diagnosticProbes: 1,
    environmentRebuilds: 1,
    detail: "One acceptance run and one evidence-producing recovery path."
  },
  checkpoint: "Record evidence after the node oracle finishes.",
  interruptionRecovery: "Revalidate candidate and implementation identity, then resume the checkpoint.",
  network: decision(),
  credentials: decision(),
  dependencyChanges: decision(),
  externalWrites: decision("not-permitted", "External writes are outside this fixture."),
  irreversibleActions: decision("not-permitted", "Irreversible actions are outside this fixture."),
  migration: decision(),
  rollback: decision("allowed", "Discard only the isolated fixture output."),
  retention: decision("allowed", "Keep evidence until Product acceptance."),
  cleanup: decision("not-permitted", "Cleanup requires an explicit contract permission."),
  delivery: decision("not-permitted", "Delivery occurs only after Product acceptance.")
});

const acceptance = (kind: ContractNode["kind"]): AcceptanceContract => ({
  mode: kind === "component" ? 3 : 2,
  strategy: kind === "component" ? "implementation-then-check" : "user-visible",
  criteria: [`${kind} meets its named behavior.`],
  oracle: kind === "component" ? "Automated acceptance oracle" : "User acceptance",
  executor: "Agent",
  acceptor: kind === "component" ? "Automated oracle" : "User",
  evidence: ["Command, environment, implementation identity, and observed result"],
  visibility: "Component evidence is expandable; assembled behavior is shown in plain language.",
  retry: "One normal run; rebuild once only when environment evidence is invalid.",
  diagnosticPermission: "One discriminating probe for a named failure hypothesis.",
  invalidationRule: "Invalidate only for a relevant contract, implementation, or environment change."
});

const node = (
  id: string,
  kind: ContractNode["kind"],
  requirementIds: string[]
): ContractNode => ({
  id,
  kind,
  name: `${id} fixture`,
  behavior: `${id} performs one named contract behavior.`,
  inputs: ["Validated fixture input"],
  outputs: ["Deterministic fixture output"],
  interfaces: [`run(${id})`],
  resources: ["Fixture workspace"],
  sideEffects: ["Fixture output only"],
  allowedScope: ["Fixture workspace"],
  implementationConstraints: ["Deterministic and contract-bound"],
  owner: "Agent",
  closeRule: "Close only after the named oracle accepts.",
  requirementIds,
  acceptance: acceptance(kind),
  execution: execution()
});

const validCandidate = (): ContractCandidate => ({
  documentId: "fixture-product",
  candidateVersion: "2026-09-04.30",
  productVersion: "0.1.0",
  authority: {
    kind: "living-document",
    location: "outside-repository/pre-loop-plugin-living-spec.md",
    review: "PRE_LOOP_REVIEW_PASSED"
  },
  formalStartCommand: "$major-loop-runner start candidate=2026-09-04.30",
  requirements: [
    {
      id: "R1",
      confirmationSource: "User confirmed a single living document.",
      intent: "Use one living document as authority.",
      consumerNodeIds: ["C1", "M1"],
      closeEvidence: ["Compiler and Module acceptance"]
    },
    {
      id: "R2",
      confirmationSource: "User confirmed bounded evidence and Product acceptance.",
      intent: "Keep evidence bounded and Product acceptance human-owned.",
      consumerNodeIds: ["C2", "P1"],
      closeEvidence: ["Resolver and Product acceptance"]
    }
  ],
  nodes: [
    node("C1", "component", ["R1"]),
    node("C2", "component", ["R2"]),
    node("M1", "module", ["R1"]),
    node("P1", "product", ["R2"])
  ],
  edges: [
    { kind: "ASSEMBLES", from: "P1", to: "M1" },
    { kind: "ASSEMBLES", from: "M1", to: "C1" },
    { kind: "ASSEMBLES", from: "M1", to: "C2" }
  ],
  executionOrder: ["C1", "C2", "M1", "P1"],
  plannedWork: [
    {
      id: "W-C1",
      kind: "action",
      description: "Compile the fixture contract.",
      consumerNodeIds: ["C1"],
      allowedScope: ["Fixture workspace"],
      basis: { kind: "requirement", requirementIds: ["R1"] }
    },
    {
      id: "W-C1-TEST",
      kind: "test",
      description: "Run the C1 acceptance oracle.",
      consumerNodeIds: ["C1"],
      allowedScope: ["Fixture workspace"],
      basis: { kind: "necessary-consequence", workItemId: "W-C1" }
    }
  ],
  intentTerms: [
    { id: "C1", canonical: "Contract compiler", aliases: ["合同编译器", "compile contract"] },
    { id: "M1", canonical: "Contract authority", aliases: ["合同权威"] }
  ],
  unresolvedItems: []
});

const expectCompilationFailure = (
  mutate: (candidate: ContractCandidate) => void,
  expected: RegExp
): void => {
  const candidate = validCandidate();
  mutate(candidate);
  assert.throws(() => compile(candidate), (error: unknown) => {
    assert.ok(error instanceof ContractCompilationError);
    assert.match(error.message, expected);
    return true;
  });
};

test("C1 compiles deterministic graph, traceability, task, acceptance, and Guard projections", () => {
  const candidate = validCandidate();
  const first = compile(candidate);
  const second = compile(structuredClone(candidate));

  assert.deepEqual(first, second);
  assert.equal(first.graph.productId, "P1");
  assert.deepEqual(first.graph.executionOrder, ["C1", "C2", "M1", "P1"]);
  assert.deepEqual(first.traceability.requirementToNodes.R1, ["C1", "M1"]);
  assert.deepEqual(first.traceability.nodeToRequirements.C2, ["R2"]);
  assert.deepEqual(first.nodeCards.find((card) => card.id === "M1")?.childNodeIds, ["C1", "C2"]);
  assert.deepEqual(first.nodeCards.find((card) => card.id === "C1")?.workItemIds, ["W-C1", "W-C1-TEST"]);
  assert.equal(first.acceptanceProjection.length, 4);
  assert.equal(first.guardProjection.length, 4);
});

test("C1 rejects schema omissions and graph violations", async (suite) => {
  await suite.test("missing decision category", () => {
    expectCompilationFailure((candidate) => {
      const raw = candidate.nodes[0]?.execution as unknown as Record<string, unknown>;
      delete raw.externalWrites;
    }, /schema .*externalWrites/);
  });

  await suite.test("second Product", () => {
    expectCompilationFailure((candidate) => {
      const c2 = candidate.nodes.find((candidateNode) => candidateNode.id === "C2");
      if (c2) c2.kind = "product";
    }, /exactly one Product/);
  });

  await suite.test("Component with a child", () => {
    expectCompilationFailure((candidate) => {
      candidate.edges.push({ kind: "ASSEMBLES", from: "C1", to: "C2" });
    }, /Component C1/);
  });

  await suite.test("orphan node", () => {
    expectCompilationFailure((candidate) => {
      candidate.nodes.push(node("C3", "component", ["R1"]));
      candidate.requirements[0]?.consumerNodeIds.push("C3");
      candidate.executionOrder.splice(2, 0, "C3");
    }, /not reachable from Product/);
  });

  await suite.test("cycle", () => {
    expectCompilationFailure((candidate) => {
      candidate.edges.push({ kind: "REQUIRES", from: "C1", to: "M1" });
    }, /graph contains a cycle/);
  });

  await suite.test("dependency order", () => {
    expectCompilationFailure((candidate) => {
      candidate.edges.push({ kind: "REQUIRES", from: "C1", to: "C2" });
    }, /requires C2 before C1/);
  });
});

test("C1 rejects broken bidirectional traceability and unmapped work", async (suite) => {
  await suite.test("one-sided requirement mapping", () => {
    expectCompilationFailure((candidate) => {
      candidate.requirements[0]?.consumerNodeIds.pop();
    }, /not bidirectionally traced/);
  });

  await suite.test("unknown requirement in work", () => {
    expectCompilationFailure((candidate) => {
      const item = candidate.plannedWork[0];
      if (item?.basis.kind === "requirement") item.basis.requirementIds = ["R404"];
    }, /work item W-C1 references missing requirement R404/);
  });
});

test("C1 maps explicit aliases and escalates genuine ambiguity", () => {
  const terms = validCandidate().intentTerms;
  assert.deepEqual(matchIntent("合同编译器", terms), {
    status: "matched",
    query: "合同编译器",
    termId: "C1"
  });
  assert.deepEqual(
    matchIntent("合同模块", [
      ...terms,
      { id: "M2", canonical: "Runtime governance", aliases: ["合同模块"] },
      { id: "M3", canonical: "Host delivery", aliases: ["合同模块"] }
    ]),
    {
      status: "ambiguous",
      query: "合同模块",
      termIds: ["M2", "M3"]
    }
  );
  assert.deepEqual(matchIntent("未知概念", terms), {
    status: "unmatched",
    query: "未知概念"
  });
});
