import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";

import { contractCandidateSchema } from "./schema.js";
import type {
  CompiledContract,
  ContractCandidate,
  ContractEdge,
  IntentMatch,
  IntentTerm,
  NodeCard,
  PlannedWork
} from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateCandidate = ajv.compile(contractCandidateSchema);

export class ContractCompilationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`Contract compilation failed:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ContractCompilationError";
    this.issues = ordered;
  }
}

function schemaIssues(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const location = error.instancePath || "/";
    return `schema ${location}: ${error.message ?? "invalid value"}`;
  });
}

function duplicateIds(values: Array<{ id: string }>, label: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates].map((id) => `${label} id is duplicated: ${id}`);
}

function findCycle(nodeIds: string[], edges: ContractEdge[]): string[] | undefined {
  const adjacency = new Map(nodeIds.map((id) => [id, [] as string[]]));
  for (const edge of edges) adjacency.get(edge.from)?.push(edge.to);

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const visit = (id: string): string[] | undefined => {
    state.set(id, 1);
    stack.push(id);
    for (const next of adjacency.get(id) ?? []) {
      if (state.get(next) === 1) {
        const start = stack.indexOf(next);
        return [...stack.slice(start), next];
      }
      if ((state.get(next) ?? 0) === 0) {
        const cycle = visit(next);
        if (cycle) return cycle;
      }
    }
    stack.pop();
    state.set(id, 2);
    return undefined;
  };

  for (const id of [...nodeIds].sort()) {
    if ((state.get(id) ?? 0) === 0) {
      const cycle = visit(id);
      if (cycle) return cycle;
    }
  }
  return undefined;
}

function domainIssues(candidate: ContractCandidate): string[] {
  const issues = [
    ...duplicateIds(candidate.nodes, "node"),
    ...duplicateIds(candidate.requirements, "requirement"),
    ...duplicateIds(candidate.plannedWork, "work item"),
    ...duplicateIds(candidate.intentTerms, "intent term"),
    ...duplicateIds(candidate.unresolvedItems, "unresolved item")
  ];
  const nodes = new Map(candidate.nodes.map((node) => [node.id, node]));
  const requirements = new Map(
    candidate.requirements.map((requirement) => [requirement.id, requirement])
  );
  const work = new Map(candidate.plannedWork.map((item) => [item.id, item]));

  const products = candidate.nodes.filter((node) => node.kind === "product");
  if (products.length !== 1) issues.push(`expected exactly one Product, found ${products.length}`);

  const edgeKeys = new Set<string>();
  for (const edge of candidate.edges) {
    const key = `${edge.kind}:${edge.from}:${edge.to}`;
    if (edgeKeys.has(key)) issues.push(`edge is duplicated: ${key}`);
    edgeKeys.add(key);
    if (!nodes.has(edge.from)) issues.push(`edge ${key} references missing source node ${edge.from}`);
    if (!nodes.has(edge.to)) issues.push(`edge ${key} references missing target node ${edge.to}`);
    if (edge.from === edge.to) issues.push(`edge ${key} is self-referential`);
  }

  const validEdges = candidate.edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to));
  const cycle = findCycle([...nodes.keys()], validEdges);
  if (cycle) issues.push(`graph contains a cycle: ${cycle.join(" -> ")}`);

  const assembles = validEdges.filter((edge) => edge.kind === "ASSEMBLES");
  for (const edge of assembles) {
    const parent = nodes.get(edge.from);
    const child = nodes.get(edge.to);
    if (parent?.kind === "component") {
      issues.push(`Component ${parent.id} cannot assemble child ${edge.to}`);
    }
    if (child?.kind === "product") {
      issues.push(`Product ${child.id} cannot be assembled by ${edge.from}`);
    }
  }

  for (const node of candidate.nodes) {
    const childCount = assembles.filter((edge) => edge.from === node.id).length;
    if (node.kind === "component" && childCount > 0) {
      issues.push(`Component ${node.id} must be a leaf`);
    }
    if ((node.kind === "module" || node.kind === "product") && childCount === 0) {
      const label = node.kind === "module" ? "Module" : "Product";
      issues.push(`${label} ${node.id} must assemble at least one child`);
    }
  }

  const product = products[0];
  if (product) {
    const reachable = new Set<string>([product.id]);
    const queue = [product.id];
    while (queue.length > 0) {
      const parent = queue.shift();
      if (!parent) break;
      for (const edge of assembles.filter((candidateEdge) => candidateEdge.from === parent)) {
        if (!reachable.has(edge.to)) {
          reachable.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
    for (const id of nodes.keys()) {
      if (!reachable.has(id)) issues.push(`node ${id} is not reachable from Product ${product.id}`);
    }
  }

  const orderSet = new Set(candidate.executionOrder);
  if (orderSet.size !== candidate.executionOrder.length) {
    issues.push("executionOrder contains duplicate nodes");
  }
  for (const id of nodes.keys()) {
    if (!orderSet.has(id)) issues.push(`executionOrder omits node ${id}`);
  }
  for (const id of orderSet) {
    if (!nodes.has(id)) issues.push(`executionOrder references missing node ${id}`);
  }
  const position = new Map(candidate.executionOrder.map((id, index) => [id, index]));
  for (const edge of validEdges) {
    const beforePosition = position.get(edge.to);
    const afterPosition = position.get(edge.from);
    if (beforePosition !== undefined && afterPosition !== undefined && beforePosition >= afterPosition) {
      issues.push(`${edge.kind} requires ${edge.to} before ${edge.from} in executionOrder`);
    }
  }

  for (const node of candidate.nodes) {
    for (const requirementId of node.requirementIds) {
      if (!requirements.has(requirementId)) {
        issues.push(`node ${node.id} references missing requirement ${requirementId}`);
      }
    }
  }

  for (const requirement of candidate.requirements) {
    const declared = [...requirement.consumerNodeIds].sort();
    const observed = candidate.nodes
      .filter((node) => node.requirementIds.includes(requirement.id))
      .map((node) => node.id)
      .sort();
    for (const consumerId of declared) {
      if (!nodes.has(consumerId)) {
        issues.push(`requirement ${requirement.id} references missing consumer ${consumerId}`);
      }
    }
    if (JSON.stringify(declared) !== JSON.stringify(observed)) {
      issues.push(`requirement ${requirement.id} is not bidirectionally traced to the same nodes`);
    }
  }

  for (const item of candidate.plannedWork) {
    for (const consumerId of item.consumerNodeIds) {
      if (!nodes.has(consumerId)) {
        issues.push(`work item ${item.id} references missing consumer ${consumerId}`);
      }
    }
    if (item.basis.kind === "requirement") {
      for (const requirementId of item.basis.requirementIds) {
        if (!requirements.has(requirementId)) {
          issues.push(`work item ${item.id} references missing requirement ${requirementId}`);
        }
      }
    } else if (!work.has(item.basis.workItemId)) {
      issues.push(
        `work item ${item.id} references missing necessary consequence ${item.basis.workItemId}`
      );
    }
  }

  return issues;
}

function byId<T extends { id: string }>(left: T, right: T): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function edgeOrder(left: ContractEdge, right: ContractEdge): number {
  const leftKey = `${left.kind}:${left.from}:${left.to}`;
  const rightKey = `${right.kind}:${right.from}:${right.to}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function compile(candidateInput: unknown): CompiledContract {
  if (!validateCandidate(candidateInput)) {
    throw new ContractCompilationError(schemaIssues(validateCandidate.errors));
  }

  const candidate = clone(candidateInput as ContractCandidate);
  const issues = domainIssues(candidate);
  if (issues.length > 0) throw new ContractCompilationError(issues);

  const nodes = new Map(candidate.nodes.map((node) => [node.id, node]));
  const workByNode = new Map<string, PlannedWork[]>();
  for (const item of candidate.plannedWork) {
    for (const nodeId of item.consumerNodeIds) {
      const items = workByNode.get(nodeId) ?? [];
      items.push(item);
      workByNode.set(nodeId, items);
    }
  }

  const nodeCards: NodeCard[] = candidate.executionOrder.map((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node) {
      throw new ContractCompilationError([`executionOrder references missing node ${nodeId}`]);
    }
    return {
      ...clone(node),
      childNodeIds: candidate.edges
        .filter((edge) => edge.kind === "ASSEMBLES" && edge.from === nodeId)
        .map((edge) => edge.to)
        .sort(),
      requiredNodeIds: candidate.edges
        .filter((edge) => edge.kind === "REQUIRES" && edge.from === nodeId)
        .map((edge) => edge.to)
        .sort(),
      workItemIds: (workByNode.get(nodeId) ?? []).map((item) => item.id).sort()
    };
  });

  const requirementToNodes = Object.fromEntries(
    [...candidate.requirements]
      .sort(byId)
      .map((requirement) => [requirement.id, [...requirement.consumerNodeIds].sort()])
  );
  const nodeToRequirements = Object.fromEntries(
    [...candidate.nodes]
      .sort(byId)
      .map((node) => [node.id, [...node.requirementIds].sort()])
  );
  const product = candidate.nodes.find((node) => node.kind === "product");
  if (!product) throw new ContractCompilationError(["expected exactly one Product, found 0"]);

  return {
    identity: {
      documentId: candidate.documentId,
      candidateVersion: candidate.candidateVersion,
      productVersion: candidate.productVersion,
      authorityLocation: candidate.authority.location,
      formalStartCommand: candidate.formalStartCommand
    },
    graph: {
      productId: product.id,
      edges: [...candidate.edges].sort(edgeOrder),
      executionOrder: [...candidate.executionOrder]
    },
    traceability: { requirementToNodes, nodeToRequirements },
    nodeCards,
    taskProjection: [...candidate.plannedWork].sort(byId),
    acceptanceProjection: nodeCards.map((card) => ({
      nodeId: card.id,
      acceptance: clone(card.acceptance)
    })),
    guardProjection: nodeCards.map((card) => ({
      nodeId: card.id,
      allowedScope: [...card.allowedScope],
      execution: clone(card.execution),
      workItemIds: [...card.workItemIds]
    })),
    unresolvedItems: [...candidate.unresolvedItems].sort(byId)
  };
}

function normalizeIntent(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export function matchIntent(query: string, terms: IntentTerm[]): IntentMatch {
  const normalizedQuery = normalizeIntent(query);
  const matches = terms
    .filter((term) =>
      [term.canonical, ...term.aliases].some(
        (candidate) => normalizeIntent(candidate) === normalizedQuery
      )
    )
    .map((term) => term.id)
    .sort();

  if (matches.length === 0) return { status: "unmatched", query };
  const termId = matches[0];
  if (matches.length === 1 && termId) return { status: "matched", query, termId };
  return { status: "ambiguous", query, termIds: matches };
}
// SPDX-License-Identifier: MPL-2.0
