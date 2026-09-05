function clone(value) {
    return structuredClone(value);
}
function isNonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function repeated(values) {
    const seen = new Set();
    const duplicates = new Set();
    for (const value of values) {
        if (seen.has(value))
            duplicates.add(value);
        seen.add(value);
    }
    return [...duplicates].sort();
}
function validateStringList(values, label, minimum = 0) {
    const issues = [];
    if (values.length < minimum)
        issues.push(`${label} requires at least ${minimum} value(s)`);
    if (values.some((value) => !isNonEmpty(value)))
        issues.push(`${label} contains an empty value`);
    for (const value of repeated(values))
        issues.push(`${label} contains duplicate ${value}`);
    return issues;
}
export function validateSkillDefinition(skill) {
    const issues = [];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.id))
        issues.push(`skill id is invalid: ${skill.id}`);
    if (!isNonEmpty(skill.trigger))
        issues.push(`skill ${skill.id} trigger is empty`);
    issues.push(...validateStringList(skill.supportedIntents, `skill ${skill.id} intents`, 1));
    issues.push(...validateStringList(skill.capabilities, `skill ${skill.id} capabilities`, 1));
    issues.push(...validateStringList(skill.allowedActions, `skill ${skill.id} actions`));
    issues.push(...validateStringList(skill.resources, `skill ${skill.id} resources`));
    issues.push(...validateStringList(skill.inputs, `skill ${skill.id} inputs`, 1));
    issues.push(...validateStringList(skill.outputs, `skill ${skill.id} outputs`, 1));
    issues.push(...validateStringList(skill.completionCriteria, `skill ${skill.id} completion criteria`, 1));
    if (skill.origin === "task-local" && !skill.taskLocal) {
        issues.push(`task-local skill ${skill.id} has no task-local contract`);
    }
    if (skill.origin !== "task-local" && skill.taskLocal) {
        issues.push(`non-task-local skill ${skill.id} has a task-local contract`);
    }
    if (skill.taskLocal) {
        if (!isNonEmpty(skill.taskLocal.contractPointer)) {
            issues.push(`task-local skill ${skill.id} contract pointer is empty`);
        }
        issues.push(...validateStringList(skill.taskLocal.consumerIds, `skill ${skill.id} consumers`, 1));
    }
    return issues.sort();
}
export function skillCompatibilityIssues(skill, consumer) {
    const issues = [];
    if (!isNonEmpty(consumer.id))
        issues.push("skill consumer id is empty");
    if (!skill.supportedIntents.includes(consumer.intent)) {
        issues.push(`skill ${skill.id} does not support intent ${consumer.intent}`);
    }
    const missingCapabilities = consumer.requiredCapabilities
        .filter((capability) => !skill.capabilities.includes(capability))
        .sort();
    if (missingCapabilities.length > 0) {
        issues.push(`skill ${skill.id} lacks capabilities for consumer ${consumer.id}: ${missingCapabilities.join(", ")}`);
    }
    const expandedActions = skill.allowedActions
        .filter((action) => !consumer.allowedActions.includes(action))
        .sort();
    if (expandedActions.length > 0) {
        issues.push(`skill ${skill.id} would expand actions beyond consumer ${consumer.id}: ${expandedActions.join(", ")}`);
    }
    const expandedResources = skill.resources
        .filter((resource) => !consumer.resources.includes(resource))
        .sort();
    if (expandedResources.length > 0) {
        issues.push(`skill ${skill.id} would expand resources beyond consumer ${consumer.id}: ${expandedResources.join(", ")}`);
    }
    for (const input of consumer.inputs.filter((value) => !skill.inputs.includes(value)).sort()) {
        issues.push(`skill ${skill.id} does not accept input ${input}`);
    }
    for (const output of consumer.outputs.filter((value) => !skill.outputs.includes(value)).sort()) {
        issues.push(`skill ${skill.id} does not provide output ${output}`);
    }
    for (const criterion of consumer.completionCriteria
        .filter((value) => !skill.completionCriteria.includes(value)).sort()) {
        issues.push(`skill ${skill.id} does not satisfy completion criterion ${criterion}`);
    }
    if (skill.taskLocal && !skill.taskLocal.consumerIds.includes(consumer.id)) {
        issues.push(`consumer ${consumer.id} is not a bound consumer for task-local skill ${skill.id}`);
    }
    return issues.sort();
}
export class SkillPoolError extends Error {
    issues;
    constructor(issues) {
        const ordered = [...new Set(issues)].sort();
        super(`Skill pool operation failed:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
        this.name = "SkillPoolError";
        this.issues = ordered;
    }
}
export class SkillPool {
    #entries = new Map();
    constructor(skills = []) {
        this.discover(skills);
    }
    discover(skills) {
        const issues = [];
        for (const skill of skills) {
            issues.push(...validateSkillDefinition(skill));
            if (this.#entries.has(skill.id))
                issues.push(`skill is already discovered: ${skill.id}`);
        }
        const ids = skills.map((skill) => skill.id);
        for (const id of repeated(ids))
            issues.push(`skill is duplicated in discovery: ${id}`);
        if (issues.length > 0)
            throw new SkillPoolError(issues);
        for (const skill of skills) {
            this.#entries.set(skill.id, {
                skill: clone(skill),
                status: "out-of-pool",
                consumerIds: []
            });
        }
    }
    enter(skillId, consumer) {
        const entry = this.#entries.get(skillId);
        if (!entry)
            throw new SkillPoolError([`skill is not discovered: ${skillId}`]);
        const issues = skillCompatibilityIssues(entry.skill, consumer);
        if (issues.length > 0)
            throw new SkillPoolError(issues);
        if (!entry.consumerIds.includes(consumer.id))
            entry.consumerIds.push(consumer.id);
        entry.consumerIds.sort();
        entry.status = "in-pool";
        return clone(entry);
    }
    use(skillId, consumerId) {
        const entry = this.#entries.get(skillId);
        if (!entry)
            throw new SkillPoolError([`skill is not discovered: ${skillId}`]);
        if (entry.status !== "in-pool" || !entry.consumerIds.includes(consumerId)) {
            throw new SkillPoolError([`skill ${skillId} is not in-pool for consumer ${consumerId}`]);
        }
        return clone(entry.skill);
    }
    exitConsumer(consumerId) {
        const exited = [];
        for (const entry of this.#entries.values()) {
            entry.consumerIds = entry.consumerIds.filter((id) => id !== consumerId);
            if (entry.status === "in-pool" && entry.consumerIds.length === 0) {
                entry.status = "out-of-pool";
                exited.push(entry.skill.id);
            }
        }
        return exited.sort();
    }
    snapshot() {
        return {
            entries: [...this.#entries.values()]
                .map((entry) => clone(entry))
                .sort((left, right) => left.skill.id.localeCompare(right.skill.id))
        };
    }
    contractProjection(managedSkillIds, explicitOnlySkillIds = []) {
        const managed = new Set(managedSkillIds);
        const explicitOnly = new Set(explicitOnlySkillIds);
        return {
            entries: this.snapshot().entries.map((entry) => ({
                skillId: entry.skill.id,
                status: entry.status,
                ownership: managed.has(entry.skill.id) ? "managed" : "external",
                explicitOnly: explicitOnly.has(entry.skill.id)
            }))
        };
    }
}
export function skillIsInPool(projection, skillId) {
    return projection.entries.some((entry) => entry.skillId === skillId && entry.status === "in-pool");
}
