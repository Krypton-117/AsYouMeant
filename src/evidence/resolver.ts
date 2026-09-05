import type {
  EvidenceCatalog,
  EvidenceQuestion,
  EvidenceReport,
  EvidenceSource
} from "./types.js";

export class EvidenceResolutionError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`Evidence resolution failed:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "EvidenceResolutionError";
    this.issues = ordered;
  }
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function duplicateValues(values: string[], label: string): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].map((value) => `${label} is duplicated: ${value}`);
}

function sourceIssues(question: EvidenceQuestion, source: EvidenceSource): string[] {
  const issues: string[] = [];
  if (!isNonEmpty(source.id)) issues.push(`question ${question.id} has a source without an id`);
  if (!isNonEmpty(source.title)) issues.push(`source ${source.id} has no title`);
  if (!isNonEmpty(source.publisher)) issues.push(`source ${source.id} has no publisher`);
  if (!isNonEmpty(source.claim)) issues.push(`source ${source.id} has no claim`);
  if (!isNonEmpty(source.retrievedAt)) issues.push(`source ${source.id} has no retrieval time`);
  if (source.primary !== true) issues.push(`source ${source.id} is not marked as primary`);
  if (!question.acceptedSourceKinds.includes(source.kind)) {
    issues.push(`source ${source.id} kind ${source.kind} is not accepted for question ${question.id}`);
  }
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:") issues.push(`source ${source.id} must use https`);
  } catch {
    issues.push(`source ${source.id} has an invalid URL`);
  }
  if (source.limitations.length === 0 || source.limitations.some((item) => !isNonEmpty(item))) {
    issues.push(`source ${source.id} must state its limitations`);
  }
  return issues;
}

function questionIssues(question: EvidenceQuestion, knownConsumers: Set<string>): string[] {
  const issues = [
    ...duplicateValues(question.consumerIds, `question ${question.id} consumer`),
    ...duplicateValues(question.acceptedSourceKinds, `question ${question.id} source kind`),
    ...duplicateValues(
      question.sources.map((source) => source.id),
      `question ${question.id} source id`
    )
  ];
  if (!isNonEmpty(question.id)) issues.push("question id is empty");
  if (!isNonEmpty(question.question)) issues.push(`question ${question.id} has no question text`);
  if (question.consumerIds.length === 0) issues.push(`question ${question.id} has no named consumer`);
  for (const consumerId of question.consumerIds) {
    if (!knownConsumers.has(consumerId)) {
      issues.push(`question ${question.id} references unknown consumer ${consumerId}`);
    }
  }
  if (question.acceptedSourceKinds.length === 0) {
    issues.push(`question ${question.id} has no accepted primary-source kind`);
  }
  if (question.sources.length === 0) issues.push(`question ${question.id} has no evidence sources`);
  for (const source of question.sources) issues.push(...sourceIssues(question, source));

  const impact = question.decisionImpact;
  if (!isNonEmpty(impact.decisionId)) issues.push(`question ${question.id} has no decision consumer`);
  if (impact.kind === "optional-improvement") {
    if (!isNonEmpty(impact.improvementId)) {
      issues.push(`question ${question.id} has no optional improvement id`);
    }
    const permission = question.directPermission;
    if (permission) {
      if (permission.sourceKind !== "direct-user" || !isNonEmpty(permission.source)) {
        issues.push(`question ${question.id} permission is not a direct user source`);
      }
      if (permission.improvementId !== impact.improvementId) {
        issues.push(`question ${question.id} permission does not match ${impact.improvementId}`);
      }
    }
  } else if (question.directPermission) {
    issues.push(`question ${question.id} attaches implementation permission to a non-improvement`);
  }
  return issues;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class EvidenceResolver {
  readonly #catalog: EvidenceCatalog;

  constructor(catalog: EvidenceCatalog) {
    const issues = [
      ...duplicateValues(catalog.consumerIds, "catalog consumer"),
      ...duplicateValues(
        catalog.questions.map((question) => question.id),
        "question id"
      )
    ];
    if (issues.length > 0) throw new EvidenceResolutionError(issues);
    this.#catalog = clone(catalog);
  }

  resolve(questionId: string): EvidenceReport {
    const question = this.#catalog.questions.find((candidate) => candidate.id === questionId);
    if (!question) throw new EvidenceResolutionError([`unknown question: ${questionId}`]);

    const issues = questionIssues(question, new Set(this.#catalog.consumerIds));
    if (issues.length > 0) throw new EvidenceResolutionError(issues);

    const sources = [...question.sources]
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map(clone);
    const permission = question.directPermission;
    const authorized =
      question.decisionImpact.kind === "optional-improvement" && permission !== undefined;

    return {
      questionId: question.id,
      question: question.question,
      consumerIds: [...question.consumerIds].sort(),
      decisionImpact: clone(question.decisionImpact),
      findings: sources.map((source) => ({
        sourceId: source.id,
        claim: source.claim,
        limitations: [...source.limitations]
      })),
      sources,
      disposition:
        question.decisionImpact.kind !== "optional-improvement"
          ? "evidence-only"
          : authorized
            ? "implementation-authorized"
            : "proposal-only",
      executionProjectionChange:
        authorized && permission && question.decisionImpact.kind === "optional-improvement"
          ? {
              kind: "authorize-optional-improvement",
              improvementId: question.decisionImpact.improvementId,
              permissionSource: permission.source
            }
          : null
    };
  }
}
// SPDX-License-Identifier: MPL-2.0
