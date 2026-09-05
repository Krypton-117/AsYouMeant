export type NodeKind = "component" | "module" | "product";
export type EdgeKind = "ASSEMBLES" | "REQUIRES";
export type AcceptanceMode = 1 | 2 | 3;
export type AcceptanceStrategy =
  | "test-first"
  | "implementation-then-check"
  | "user-visible"
  | "combined"
  | "approved-no-test";

export type PermissionState = "allowed" | "not-permitted" | "not-applicable";

export interface PermissionDecision {
  state: PermissionState;
  detail: string;
}

export interface ExecutionBudget {
  normalRuns: number;
  diagnosticProbes: number;
  environmentRebuilds: number;
  detail: string;
}

export interface ExecutionPolicy {
  readinessBoundary: string;
  sequencing: "serial" | "parallel";
  delegation: PermissionDecision;
  isolation: PermissionDecision;
  budget: ExecutionBudget;
  checkpoint: string;
  interruptionRecovery: string;
  network: PermissionDecision;
  credentials: PermissionDecision;
  dependencyChanges: PermissionDecision;
  externalWrites: PermissionDecision;
  irreversibleActions: PermissionDecision;
  migration: PermissionDecision;
  rollback: PermissionDecision;
  retention: PermissionDecision;
  cleanup: PermissionDecision;
  delivery: PermissionDecision;
}

export interface AcceptanceContract {
  mode: AcceptanceMode;
  strategy: AcceptanceStrategy;
  criteria: string[];
  oracle: string;
  executor: string;
  acceptor: string;
  evidence: string[];
  visibility: string;
  retry: string;
  diagnosticPermission: string;
  invalidationRule: string;
}

export interface ContractNode {
  id: string;
  kind: NodeKind;
  name: string;
  behavior: string;
  inputs: string[];
  outputs: string[];
  interfaces: string[];
  resources: string[];
  sideEffects: string[];
  allowedScope: string[];
  implementationConstraints: string[];
  owner: string;
  closeRule: string;
  requirementIds: string[];
  acceptance: AcceptanceContract;
  execution: ExecutionPolicy;
}

export interface ContractEdge {
  kind: EdgeKind;
  from: string;
  to: string;
}

export interface ContractRequirement {
  id: string;
  confirmationSource: string;
  intent: string;
  consumerNodeIds: string[];
  closeEvidence: string[];
}

export type WorkKind = "action" | "test" | "review" | "dependency" | "delivery";

export type WorkBasis =
  | { kind: "requirement"; requirementIds: string[] }
  | { kind: "necessary-consequence"; workItemId: string };

export interface PlannedWork {
  id: string;
  kind: WorkKind;
  description: string;
  consumerNodeIds: string[];
  allowedScope: string[];
  basis: WorkBasis;
}

export interface IntentTerm {
  id: string;
  canonical: string;
  aliases: string[];
}

export type UnknownCategory =
  | "fact"
  | "user-intent"
  | "external-authority"
  | "execution";

export interface UnresolvedItem {
  id: string;
  category: UnknownCategory;
  route: string;
}

export interface ContractCandidate {
  documentId: string;
  candidateVersion: string;
  productVersion: string;
  authority: {
    kind: "living-document";
    location: string;
    review: "PRE_LOOP_REVIEW_PASSED";
  };
  formalStartCommand: string;
  requirements: ContractRequirement[];
  nodes: ContractNode[];
  edges: ContractEdge[];
  executionOrder: string[];
  plannedWork: PlannedWork[];
  intentTerms: IntentTerm[];
  unresolvedItems: UnresolvedItem[];
}

export interface NodeCard extends ContractNode {
  childNodeIds: string[];
  requiredNodeIds: string[];
  workItemIds: string[];
}

export interface CompiledContract {
  identity: {
    documentId: string;
    candidateVersion: string;
    productVersion: string;
    authorityLocation: string;
    formalStartCommand: string;
  };
  graph: {
    productId: string;
    edges: ContractEdge[];
    executionOrder: string[];
  };
  traceability: {
    requirementToNodes: Record<string, string[]>;
    nodeToRequirements: Record<string, string[]>;
  };
  nodeCards: NodeCard[];
  taskProjection: PlannedWork[];
  acceptanceProjection: Array<{
    nodeId: string;
    acceptance: AcceptanceContract;
  }>;
  guardProjection: Array<{
    nodeId: string;
    allowedScope: string[];
    execution: ExecutionPolicy;
    workItemIds: string[];
  }>;
  unresolvedItems: UnresolvedItem[];
}

export type IntentMatch =
  | { status: "matched"; query: string; termId: string }
  | { status: "ambiguous"; query: string; termIds: string[] }
  | { status: "unmatched"; query: string };
// SPDX-License-Identifier: MPL-2.0
