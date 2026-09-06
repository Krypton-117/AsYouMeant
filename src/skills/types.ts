// SPDX-License-Identifier: MPL-2.0

export type SkillOrigin = "core" | "environment" | "task-local";
export type TaskLocalGenerationReason =
  | "context-overflow"
  | "technology-failure"
  | "reusable-loop";

export interface TaskLocalSkillContract {
  contractPointer: string;
  consumerIds: string[];
  expiry: "last-consumer-closed";
  generationReason: TaskLocalGenerationReason;
}

export interface SkillDefinition {
  id: string;
  origin: SkillOrigin;
  trigger: string;
  supportedIntents: string[];
  capabilities: string[];
  allowedActions: string[];
  resources: string[];
  inputs: string[];
  outputs: string[];
  completionCriteria: string[];
  taskLocal?: TaskLocalSkillContract;
}

export interface SkillConsumer {
  id: string;
  intent: string;
  requiredCapabilities: string[];
  allowedActions: string[];
  resources: string[];
  inputs: string[];
  outputs: string[];
  completionCriteria: string[];
}

export interface SkillPoolEntry {
  skill: SkillDefinition;
  status: "in-pool" | "out-of-pool";
  consumerIds: string[];
}

export interface SkillPoolSnapshot {
  entries: SkillPoolEntry[];
}

export interface SkillPoolContractEntry {
  skillId: string;
  status: "in-pool" | "out-of-pool";
  ownership: "managed" | "external";
  explicitOnly: boolean;
}

export interface SkillPoolContractProjection {
  entries: SkillPoolContractEntry[];
}

export interface TaskLocalSkillRequest {
  id: string;
  trigger: string;
  intent: string;
  consumerIds: string[];
  contractPointer: string;
  requiredCapabilities: string[];
  allowedActions: string[];
  resources: string[];
  inputs: string[];
  outputs: string[];
  completionCriteria: string[];
  generationReason: TaskLocalGenerationReason;
}

export type SkillResolution =
  | { kind: "existing"; skill: SkillDefinition }
  | { kind: "generated"; skill: SkillDefinition; markdown: string };
