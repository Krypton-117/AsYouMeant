// SPDX-License-Identifier: MPL-2.0

import {
  skillCompatibilityIssues,
  validateSkillDefinition
} from "./pool.js";
import type {
  SkillConsumer,
  SkillDefinition,
  SkillResolution,
  TaskLocalSkillRequest
} from "./types.js";

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function repeated(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function listIssues(values: readonly string[], label: string): string[] {
  const issues: string[] = [];
  if (values.length === 0) issues.push(`${label} is empty`);
  if (values.some((value) => !isNonEmpty(value))) issues.push(`${label} contains an empty value`);
  for (const value of repeated(values)) issues.push(`${label} contains duplicate ${value}`);
  return issues;
}

function requestIssues(request: Readonly<TaskLocalSkillRequest>): string[] {
  const issues: string[] = [];
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(request.id)) {
    issues.push(`task-local skill id is invalid: ${request.id}`);
  }
  if (!request.trigger.startsWith("Use when ")) {
    issues.push("task-local trigger must start with Use when");
  }
  if (!isNonEmpty(request.intent)) issues.push("task-local intent is empty");
  if (!isNonEmpty(request.contractPointer)) issues.push("task-local contract pointer is empty");
  issues.push(...listIssues(request.consumerIds, "task-local consumers"));
  issues.push(...listIssues(request.requiredCapabilities, "task-local capabilities"));
  issues.push(...listIssues(request.inputs, "task-local inputs"));
  issues.push(...listIssues(request.outputs, "task-local outputs"));
  issues.push(...listIssues(request.completionCriteria, "task-local completion criteria"));
  if (request.generationReason === "reusable-loop" && request.consumerIds.length < 2) {
    issues.push("reusable-loop generation requires at least two named consumers");
  }
  return issues.sort();
}

function consumer(request: Readonly<TaskLocalSkillRequest>, id: string): SkillConsumer {
  return {
    id,
    intent: request.intent,
    requiredCapabilities: [...request.requiredCapabilities],
    allowedActions: [...request.allowedActions],
    resources: [...request.resources],
    inputs: [...request.inputs],
    outputs: [...request.outputs],
    completionCriteria: [...request.completionCriteria]
  };
}

function renders(values: readonly string[]): string {
  return values.join("; ");
}

export function renderTaskLocalSkill(skill: Readonly<SkillDefinition>): string {
  if (!skill.taskLocal) throw new TaskLocalSkillError([`skill ${skill.id} is not task-local`]);
  return [
    "---",
    `name: ${skill.id}`,
    `description: ${JSON.stringify(skill.trigger)}`,
    "---",
    "",
    `# ${skill.id}`,
    "",
    `Intent: ${renders(skill.supportedIntents)}`,
    `Contract: \`${skill.taskLocal.contractPointer}\``,
    `Consumers: ${skill.taskLocal.consumerIds.map((id) => `\`${id}\``).join(", ")}`,
    `Inputs: ${renders(skill.inputs)}`,
    `Allowed actions: ${renders(skill.allowedActions) || "none"}`,
    `Resources: ${renders(skill.resources) || "none"}`,
    `Outputs: ${renders(skill.outputs)}`,
    `Completion: ${renders(skill.completionCriteria)}`,
    "",
    "Use only for the bound consumers and contract. When the last consumer closes, exit the Skill from the pool and retain its files."
  ].join("\n");
}

export class TaskLocalSkillError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`Task-local Skill compilation failed:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "TaskLocalSkillError";
    this.issues = ordered;
  }
}

export class TaskLocalSkillCompiler {
  resolve(
    request: Readonly<TaskLocalSkillRequest>,
    available: readonly SkillDefinition[]
  ): SkillResolution {
    const invalidDefinitions = available.flatMap((skill) => validateSkillDefinition(skill));
    if (invalidDefinitions.length > 0) throw new TaskLocalSkillError(invalidDefinitions);

    const candidates = [...available]
      .filter((skill) => request.consumerIds.every(
        (id) => skillCompatibilityIssues(skill, consumer(request, id)).length === 0
      ))
      .sort((left, right) => left.id.localeCompare(right.id));
    const existing = candidates[0];
    if (existing) return { kind: "existing", skill: structuredClone(existing) };

    const issues = requestIssues(request);
    if (issues.length > 0) throw new TaskLocalSkillError(issues);
    const skill: SkillDefinition = {
      id: request.id,
      origin: "task-local",
      trigger: request.trigger,
      supportedIntents: [request.intent],
      capabilities: [...request.requiredCapabilities],
      allowedActions: [...request.allowedActions],
      resources: [...request.resources],
      inputs: [...request.inputs],
      outputs: [...request.outputs],
      completionCriteria: [...request.completionCriteria],
      taskLocal: {
        contractPointer: request.contractPointer,
        consumerIds: [...request.consumerIds],
        expiry: "last-consumer-closed",
        generationReason: request.generationReason
      }
    };
    const definitionIssues = validateSkillDefinition(skill);
    if (definitionIssues.length > 0) throw new TaskLocalSkillError(definitionIssues);
    return {
      kind: "generated",
      skill: structuredClone(skill),
      markdown: `${renderTaskLocalSkill(skill)}\n`
    };
  }
}
