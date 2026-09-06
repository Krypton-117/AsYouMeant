// SPDX-License-Identifier: MPL-2.0

import type {
  SkillPoolContractEntry,
  SkillPoolContractProjection
} from "../skills/types.js";
import { skillIsInPool } from "../skills/pool.js";

export interface CodexSkillPoolEntry {
  skillId: string;
  inPool: boolean;
  mechanism: "agents-openai-yaml" | "contract-guard";
  allowImplicitInvocation: boolean | null;
}

export interface ClaudeSkillPoolProjection {
  skillOverrides: Record<string, "on" | "off">;
  contractGuardSkillIds: string[];
}

export interface OpenCodeSkillPermissionRule {
  action: "skill";
  resource: string;
  effect: "deny";
}

export interface OpenCodeSkillPoolProjection {
  permissions: OpenCodeSkillPermissionRule[];
  permission: {
    skill: Record<string, "deny">;
  };
  activeSkillIds: string[];
}

export interface DshSkillPoolProjection {
  registerSkillIds: string[];
  disposeSkillIds: string[];
}

function orderedEntries(projection: Readonly<SkillPoolContractProjection>): SkillPoolContractEntry[] {
  const ids = new Set<string>();
  const entries = [...projection.entries].sort((left, right) => left.skillId.localeCompare(right.skillId));
  for (const entry of entries) {
    if (!entry.skillId.trim()) throw new TypeError("Skill pool projection contains an empty Skill id.");
    if (ids.has(entry.skillId)) throw new TypeError(`Skill pool projection duplicates ${entry.skillId}.`);
    ids.add(entry.skillId);
  }
  return entries;
}

export function projectCodexSkillPool(
  projection: Readonly<SkillPoolContractProjection>
): CodexSkillPoolEntry[] {
  return orderedEntries(projection).map((entry) => ({
    skillId: entry.skillId,
    inPool: entry.status === "in-pool",
    mechanism: entry.ownership === "managed" ? "agents-openai-yaml" : "contract-guard",
    allowImplicitInvocation: entry.ownership === "managed"
      ? entry.status === "in-pool" && !entry.explicitOnly
      : null
  }));
}

export function projectClaudeSkillPool(
  projection: Readonly<SkillPoolContractProjection>,
  pluginSkillIds: readonly string[]
): ClaudeSkillPoolProjection {
  const pluginSkills = new Set(pluginSkillIds);
  const skillOverrides: Record<string, "on" | "off"> = {};
  const contractGuardSkillIds: string[] = [];
  for (const entry of orderedEntries(projection)) {
    if (entry.ownership === "managed" && !pluginSkills.has(entry.skillId)) {
      skillOverrides[entry.skillId] = entry.status === "in-pool" ? "on" : "off";
    } else {
      contractGuardSkillIds.push(entry.skillId);
    }
  }
  return { skillOverrides, contractGuardSkillIds: contractGuardSkillIds.sort() };
}

export function projectOpenCodeSkillPool(
  projection: Readonly<SkillPoolContractProjection>
): OpenCodeSkillPoolProjection {
  const entries = orderedEntries(projection);
  return {
    permissions: entries
      .filter((entry) => entry.status === "out-of-pool")
      .map((entry) => ({ action: "skill", resource: entry.skillId, effect: "deny" })),
    permission: {
      skill: Object.fromEntries(entries
        .filter((entry) => entry.status === "out-of-pool")
        .map((entry) => [entry.skillId, "deny" as const]))
    },
    activeSkillIds: entries
      .filter((entry) => entry.status === "in-pool")
      .map((entry) => entry.skillId)
  };
}

export function openCodeSkillIsInPool(
  projection: Readonly<SkillPoolContractProjection>,
  skillId: string
): boolean {
  orderedEntries(projection);
  return skillIsInPool(projection, skillId);
}

export function projectDshSkillPool(
  projection: Readonly<SkillPoolContractProjection>
): DshSkillPoolProjection {
  const entries = orderedEntries(projection);
  return {
    registerSkillIds: entries
      .filter((entry) => entry.status === "in-pool")
      .map((entry) => entry.skillId),
    disposeSkillIds: entries
      .filter((entry) => entry.status === "out-of-pool")
      .map((entry) => entry.skillId)
  };
}
