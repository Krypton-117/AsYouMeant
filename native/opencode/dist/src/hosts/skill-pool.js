import { skillIsInPool } from "../skills/pool.js";
function orderedEntries(projection) {
    const ids = new Set();
    const entries = [...projection.entries].sort((left, right) => left.skillId.localeCompare(right.skillId));
    for (const entry of entries) {
        if (!entry.skillId.trim())
            throw new TypeError("Skill pool projection contains an empty Skill id.");
        if (ids.has(entry.skillId))
            throw new TypeError(`Skill pool projection duplicates ${entry.skillId}.`);
        ids.add(entry.skillId);
    }
    return entries;
}
export function projectCodexSkillPool(projection) {
    return orderedEntries(projection).map((entry) => ({
        skillId: entry.skillId,
        inPool: entry.status === "in-pool",
        mechanism: entry.ownership === "managed" ? "agents-openai-yaml" : "contract-guard",
        allowImplicitInvocation: entry.ownership === "managed"
            ? entry.status === "in-pool" && !entry.explicitOnly
            : null
    }));
}
export function projectClaudeSkillPool(projection, pluginSkillIds) {
    const pluginSkills = new Set(pluginSkillIds);
    const skillOverrides = {};
    const contractGuardSkillIds = [];
    for (const entry of orderedEntries(projection)) {
        if (entry.ownership === "managed" && !pluginSkills.has(entry.skillId)) {
            skillOverrides[entry.skillId] = entry.status === "in-pool" ? "on" : "off";
        }
        else {
            contractGuardSkillIds.push(entry.skillId);
        }
    }
    return { skillOverrides, contractGuardSkillIds: contractGuardSkillIds.sort() };
}
export function projectOpenCodeSkillPool(projection) {
    const entries = orderedEntries(projection);
    return {
        permissions: entries
            .filter((entry) => entry.status === "out-of-pool")
            .map((entry) => ({ action: "skill", resource: entry.skillId, effect: "deny" })),
        permission: {
            skill: Object.fromEntries(entries
                .filter((entry) => entry.status === "out-of-pool")
                .map((entry) => [entry.skillId, "deny"]))
        },
        activeSkillIds: entries
            .filter((entry) => entry.status === "in-pool")
            .map((entry) => entry.skillId)
    };
}
export function openCodeSkillIsInPool(projection, skillId) {
    orderedEntries(projection);
    return skillIsInPool(projection, skillId);
}
export function projectDshSkillPool(projection) {
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
