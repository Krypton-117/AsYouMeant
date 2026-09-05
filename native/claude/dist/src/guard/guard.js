export class PermitIssuanceError extends Error {
    issues;
    constructor(issues) {
        const ordered = [...new Set(issues)].sort();
        super(`Major-loop permit was not issued:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
        this.name = "PermitIssuanceError";
        this.issues = ordered;
    }
}
const sourceKindByHost = {
    codex: "codex-user-prompt-submit",
    "claude-code": "claude-user-prompt-expansion",
    opencode: "opencode-command-transform",
    dsh: "dsh-skill-invocation"
};
const sensitiveKinds = new Set([
    "write",
    "test",
    "dependency",
    "hash",
    "delegate",
    "network",
    "external-write",
    "delivery"
]);
function clone(value) {
    return structuredClone(value);
}
function isNonEmpty(value) {
    return typeof value === "string" && value.trim().length > 0;
}
function parseTime(value, label) {
    if (!isNonEmpty(value))
        throw new PermitIssuanceError([`${label} must be non-empty`]);
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed))
        throw new PermitIssuanceError([`${label} is invalid`]);
    return parsed;
}
function normalizeTarget(value) {
    return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}
function targetAllowed(target, allowedTargets) {
    const normalized = normalizeTarget(target);
    return allowedTargets.some((candidate) => {
        const allowed = normalizeTarget(candidate);
        if (allowed === "**")
            return true;
        if (allowed.endsWith("/**")) {
            const root = allowed.slice(0, -3);
            return normalized === root || normalized.startsWith(`${root}/`);
        }
        return normalized === allowed;
    });
}
function missingAllowed(values, allowed) {
    return values.filter((value) => !allowed.includes(value));
}
function violation(category, reasonCode, reason, next, certainty = "known") {
    return { category, reasonCode, reason, next, certainty };
}
function outcomeFor(level, certainty) {
    if (level === "off")
        return "allow";
    if (level === "observation")
        return "observe";
    if (level === "guard" && certainty === "unknown")
        return "observe";
    return "deny";
}
function makeDecision(config, context, outcome, category, reasonCode, reason, next) {
    return {
        outcome,
        category,
        reasonCode,
        reason,
        next,
        guardEffect: outcome === "deny" ? "denied" : outcome === "observe" ? "observed" : "allowed",
        hostEffect: { outcome: "unobserved", evidenceId: null },
        feedback: { label: "unlabeled", source: null },
        runtimeEvidence: {
            candidateVersion: config.candidateVersion,
            projectionIdentity: config.projectionIdentity,
            actionId: context.action.id,
            permitId: context.permit?.permitId ?? null,
            ledgerOutcome: outcome === "deny" ? "denied" : outcome === "observe" ? "observed" : "allowed"
        }
    };
}
function coreDeny(config, context, category, reasonCode, reason, next) {
    return makeDecision(config, context, "deny", category, reasonCode, reason, next);
}
function sourcePathMatches(path, request) {
    return (path.host === request.nativeStart.host &&
        path.sourceKind === request.nativeStart.sourceKind &&
        path.command === request.nativeStart.command);
}
function validateNativeStartPath(path) {
    const issues = [];
    if (sourceKindByHost[path.host] !== path.sourceKind) {
        issues.push(`native source ${path.sourceKind} does not belong to host ${path.host}`);
    }
    if (!isNonEmpty(path.command))
        issues.push(`native start command for ${path.host} is empty`);
    return issues;
}
function validatePermitRequest(config, request) {
    const issues = [];
    if (config.review.result !== "PRE_LOOP_REVIEW_PASSED") {
        issues.push("the bound pre-loop review did not pass");
    }
    if (config.review.candidateVersion !== config.candidateVersion ||
        config.review.projectionIdentity !== config.projectionIdentity) {
        issues.push("the pre-loop review binding does not match the Guard configuration");
    }
    if (request.candidateVersion !== config.candidateVersion) {
        issues.push(`permit candidate ${request.candidateVersion} does not match ${config.candidateVersion}`);
    }
    if (request.projectionIdentity !== config.projectionIdentity) {
        issues.push("permit projection identity does not match the reviewed projection");
    }
    if (!isNonEmpty(request.permitId))
        issues.push("permit id is empty");
    if (request.nativeStart.actor !== "user" || request.nativeStart.adapterVerified !== true) {
        issues.push("the start source is not a verified native user action");
    }
    if (sourceKindByHost[request.nativeStart.host] !== request.nativeStart.sourceKind) {
        issues.push("the start source kind does not match its host");
    }
    if (!isNonEmpty(request.nativeStart.evidenceId))
        issues.push("native start evidence id is empty");
    if (!config.nativeStartPaths.some((path) => sourcePathMatches(path, request))) {
        issues.push("the start command and source do not match an approved native path");
    }
    const issuedAt = parseTime(request.issuedAt, "permit issue time");
    const expiresAt = parseTime(request.expiresAt, "permit expiry time");
    if (expiresAt <= issuedAt)
        issues.push("permit expiry must be later than its issue time");
    if (issues.length > 0)
        throw new PermitIssuanceError(issues);
}
function validateConfig(config) {
    const issues = [];
    if (!isNonEmpty(config.candidateVersion))
        issues.push("Guard candidate version is empty");
    if (!isNonEmpty(config.projectionIdentity))
        issues.push("Guard projection identity is empty");
    if (config.nativeStartPaths.length === 0)
        issues.push("Guard has no approved native start path");
    for (const path of config.nativeStartPaths)
        issues.push(...validateNativeStartPath(path));
    const policy = config.policy;
    if (!Number.isInteger(policy.agentBudget) || policy.agentBudget < 0) {
        issues.push("agent budget must be a non-negative integer");
    }
    if (!Number.isInteger(policy.agentsUsed) || policy.agentsUsed < 0) {
        issues.push("agents used must be a non-negative integer");
    }
    if (!Number.isInteger(policy.retryBudget) || policy.retryBudget < 0) {
        issues.push("retry budget must be a non-negative integer");
    }
    const uniqueLists = [
        ["native start path", config.nativeStartPaths.map((path) => `${path.host}:${path.sourceKind}:${path.command}`)],
        ["work item", policy.allowedWorkItemIds],
        ["path", policy.allowedPaths],
        ["dependency", policy.allowedDependencies],
        ["hash consumer", policy.allowedHashConsumerIds],
        ["test", policy.allowedTestIds],
        ["network target", policy.allowedNetworkTargets],
        ["external write target", policy.allowedExternalWriteTargets]
    ];
    for (const [label, values] of uniqueLists) {
        if (new Set(values).size !== values.length)
            issues.push(`${label} entries must be unique`);
    }
    if (issues.length > 0)
        throw new PermitIssuanceError(issues);
    return clone(config);
}
function isSensitive(action) {
    return action.mutability !== "read" || sensitiveKinds.has(action.kind);
}
function permitIssue(config, context) {
    const permit = context.permit;
    if (!permit) {
        return violation("intent-violation", "PERMIT_REQUIRED", "A sensitive major-loop action has no active permit.", "Use the reviewed host-native start command from a direct user path.");
    }
    try {
        validatePermitRequest(config, permit);
    }
    catch (error) {
        const reason = error instanceof Error ? error.message : "The permit is invalid.";
        return violation("intent-violation", "PERMIT_BINDING_INVALID", reason, "Discard this permit and obtain a new permit from the reviewed native start path.");
    }
    if (permit.status !== "active") {
        return violation("intent-violation", "PERMIT_INACTIVE", "The supplied major-loop permit is not active.", "Obtain a new active permit.");
    }
    const now = Date.parse(context.now);
    const issuedAt = Date.parse(permit.issuedAt);
    const expiresAt = Date.parse(permit.expiresAt);
    if (Number.isNaN(now)) {
        return violation("intent-violation", "DECISION_TIME_INVALID", "The Guard decision time is invalid.", "Provide an observed ISO timestamp before evaluating the action.");
    }
    if (now < issuedAt || now >= expiresAt) {
        return violation("intent-violation", "PERMIT_EXPIRED", "The major-loop permit is not active at the decision time.", "Obtain a fresh permit from the reviewed native start path.");
    }
    return null;
}
function firstPolicyViolation(config, action) {
    const policy = config.policy;
    const nonMutatingMode = policy.taskMode === "answer" || policy.taskMode === "review" || policy.taskMode === "monitoring";
    if (nonMutatingMode && action.mutability === "write") {
        return violation("intent-violation", "MODE_FORBIDS_MUTATION", `Task mode ${policy.taskMode} does not authorize mutation.`, "Use a read-only action or obtain a change/open-work contract.");
    }
    if (nonMutatingMode && action.mutability === "unknown") {
        return violation("intent-violation", "MUTABILITY_UNPROVEN", `The action is not proven read-only under ${policy.taskMode} mode.`, "Use a clearly read-only action or obtain a change/open-work contract.", "unknown");
    }
    if (action.contradictsUserIntent) {
        return violation("intent-violation", "USER_INTENT_CONTRADICTION", "The action contradicts a confirmed user intent.", "Stop and use the confirmed behavior, or revise the contract with the user.");
    }
    if (action.basis.kind === "unapproved-expansion") {
        return violation("scope-creep", "UNAPPROVED_SCOPE_EXPANSION", "The action is neither requested nor an established necessary consequence.", "Drop it, or obtain a contract revision that names its consumer and effect.");
    }
    if (action.basis.kind === "requested" && action.basis.requirementIds.length === 0) {
        return violation("scope-creep", "REQUEST_SOURCE_MISSING", "The action claims to be requested but names no requirement.", "Map it to a confirmed requirement or remove it.");
    }
    if (action.basis.kind === "necessary-consequence" &&
        (action.basis.consumerIds.length === 0 ||
            action.basis.reachableEvidenceIds.length === 0 ||
            !action.basis.omissionFailsAcceptance)) {
        return violation("scope-creep", "STOP_LADDER_UNSATISFIED", "The claimed necessary consequence has no complete consumer, reachable evidence, and omission failure.", "Drop it or record the missing Stop Ladder evidence before acting.");
    }
    if (action.kind === "hash") {
        if (policy.hashPolicy !== "allow" ||
            !action.hashConsumerId ||
            !policy.allowedHashConsumerIds.includes(action.hashConsumerId)) {
            return violation("hashing-or-hypothetical-hardening", "HASH_NOT_AUTHORIZED", "Hashing has no exact allowed policy and named consumer.", "Use the direct alternative or obtain hash permission for the named consumer.");
        }
    }
    if (action.hardening && action.reachability !== "reachable") {
        return violation("hashing-or-hypothetical-hardening", "HYPOTHETICAL_HARDENING", "The proposed hardening has no proven reachable code, data, or deployed state.", "Defer it until reachable evidence establishes a current consumer.", action.reachability === "unknown" ? "unknown" : "known");
    }
    if (action.mutability === "write") {
        if (action.targetPaths.length === 0 && !policy.allowedPaths.includes("**")) {
            return violation("scope-creep", "WRITE_PATH_UNPROVEN", "The write target is not proven inside the allowed path boundary.", "Use an action with visible targets or revise the file boundary.", "unknown");
        }
        const outside = action.targetPaths.filter((target) => !targetAllowed(target, policy.allowedPaths));
        if (outside.length > 0) {
            return violation("scope-creep", "PATH_OUTSIDE_CONTRACT", `The action writes outside the allowed path boundary: ${outside.join(", ")}.`, "Keep writes inside the contract or obtain an explicit revision.");
        }
    }
    if (action.kind === "dependency") {
        const outside = missingAllowed(action.dependencyNames, policy.allowedDependencies);
        if (policy.dependencyPolicy !== "allow" || action.dependencyNames.length === 0 || outside.length > 0) {
            return violation("scope-creep", "DEPENDENCY_NOT_AUTHORIZED", "The dependency action is not exactly allowed by the active contract.", "Use the existing stack or obtain direct permission for the named dependency.");
        }
    }
    if (action.kind === "delegate") {
        if (!action.boundedDelegation || !Number.isInteger(action.delegationCount) || action.delegationCount < 1) {
            return violation("scope-creep", "UNBOUNDED_DELEGATION", "The delegation does not have a finite, explicit fan-out.", "Continue locally or declare an exact agent budget and batch size.", action.boundedDelegation ? "unknown" : "known");
        }
        if (policy.agentsUsed + action.delegationCount > policy.agentBudget) {
            return violation("scope-creep", "AGENT_BUDGET_EXHAUSTED", "The delegation exceeds the active agent budget.", "Continue locally or obtain a revised bounded delegation budget.");
        }
    }
    if (action.kind === "test") {
        const test = action.test;
        if (!test || !policy.allowedTestIds.includes(test.testId)) {
            return violation("task-thrashing", "TEST_NOT_MAPPED", "The test is not a named acceptance, diagnostic, or regression action.", "Run only the mapped test or revise the node acceptance contract.");
        }
        if (test.classification === "exploratory-repeated") {
            return violation("task-thrashing", "EXPLORATORY_TEST_REJECTED", "The test has no current acceptance, diagnostic, or regression consumer.", "Stop testing until a contract criterion or failure hypothesis consumes it.");
        }
        if (test.hasEquivalentValidEvidence && !test.relevantChange && !test.contractRequiresRepeat) {
            return violation("task-thrashing", "EQUIVALENT_TEST_EVIDENCE_EXISTS", "Equivalent valid evidence already closes this test identity.", "Reuse the evidence; rerun only after relevant invalidation or a contracted repeat.");
        }
        if (test.classification === "diagnostic" &&
            (!test.failureEvidenceId || test.hypothesisIds.length === 0 || !test.discriminating)) {
            return violation("task-thrashing", "DIAGNOSTIC_BASIS_INCOMPLETE", "The diagnostic test lacks failure evidence, hypotheses, or a discriminating probe.", "Use the diagnostic kernel to name one evidence-bound discriminating probe.");
        }
    }
    if (action.retry) {
        if (!Number.isInteger(action.retry.attempt) || action.retry.attempt < 0) {
            return violation("task-thrashing", "RETRY_COUNT_INVALID", "The retry count is not a non-negative integer.", "Record an exact retry attempt before acting.");
        }
        if (action.retry.attempt > policy.retryBudget) {
            return violation("task-thrashing", "RETRY_BUDGET_EXHAUSTED", "The action exceeds the contracted retry budget.", "Stop and report the last evidence or request a contract revision.");
        }
        if (action.retry.attempt > 0 &&
            action.retry.newEvidenceIds.length === 0 &&
            !action.retry.relatedImplementationChanged &&
            !action.retry.environmentInvalidated) {
            return violation("task-thrashing", "RETRY_HAS_NO_NEW_BASIS", "The retry has no new evidence, related implementation change, or environment invalidation.", "Reuse the existing result and stop the repeated path.");
        }
    }
    if (action.repeat && !action.repeat.newEvidenceExpected && !action.repeat.relatedChange) {
        return violation("task-thrashing", "REPEATED_ACTION_HAS_NO_NEW_VALUE", `The action repeats ${action.repeat.priorActionId} without a new decision or related change.`, "Stop the repeated search, test, review, or audit and reuse existing evidence.");
    }
    if (action.kind === "network") {
        const outside = missingAllowed(action.networkTargets, policy.allowedNetworkTargets);
        if (action.networkTargets.length === 0 || outside.length > 0) {
            return violation("scope-creep", "NETWORK_NOT_AUTHORIZED", "The network destination is not exactly allowed by the active contract.", "Use an approved destination or revise the contract before network access.");
        }
    }
    if (action.kind === "external-write") {
        const outside = missingAllowed(action.externalWriteTargets, policy.allowedExternalWriteTargets);
        if (action.externalWriteTargets.length === 0 || outside.length > 0) {
            return violation("scope-creep", "EXTERNAL_WRITE_NOT_AUTHORIZED", "The external write target is not exactly allowed by the active contract.", "Keep the action local or obtain direct permission for the external target.");
        }
    }
    if (action.kind === "delivery" && !policy.deliveryAllowed) {
        return violation("scope-creep", "DELIVERY_NOT_AUTHORIZED", "Delivery is a separate permission and is not active.", "Wait for the required Product acceptance and direct delivery permission.");
    }
    if (action.privilegeExpansion) {
        return violation("scope-creep", "PRIVILEGE_EXPANSION", "The action expands permissions beyond the reviewed contract.", "Stop and revise the contract before expanding permissions.");
    }
    return null;
}
export class Guard {
    #config;
    constructor(config) {
        this.#config = validateConfig(config);
    }
    mintPermit(request) {
        validatePermitRequest(this.#config, request);
        return { ...clone(request), status: "active" };
    }
    decide(context) {
        const action = context.action;
        if (!isNonEmpty(action.id)) {
            return coreDeny(this.#config, context, "scope-creep", "ACTION_ID_MISSING", "The action has no identity.", "Give the mapped action a stable identity before evaluation.");
        }
        const workItemId = action.workItemId;
        if (!workItemId || !this.#config.policy.allowedWorkItemIds.includes(workItemId)) {
            return coreDeny(this.#config, context, "scope-creep", "UNMAPPED_ACTION", "The action is not present in the reviewed task projection.", "Drop it or revise and re-review the contract before execution.");
        }
        const sensitive = isSensitive(action);
        if (sensitive && (context.phase === "pre-loop" || context.phase === "pre-start")) {
            return coreDeny(this.#config, context, "intent-violation", "PRE_START_HARD_LOCK", "Sensitive work is locked until review passes and a native user start creates a permit.", "Complete the gate, then send the exact host-native start command as a new user action.");
        }
        if (sensitive) {
            const issue = permitIssue(this.#config, context);
            if (issue) {
                return coreDeny(this.#config, context, issue.category, issue.reasonCode, issue.reason, issue.next);
            }
        }
        if (this.#config.policy.executionState !== "active" && sensitive) {
            const stopped = this.#config.policy.executionState === "stopped";
            return coreDeny(this.#config, context, "intent-violation", stopped ? "EXECUTION_STOPPED" : "EXECUTION_PAUSED", stopped ? "The user stopped this execution." : "The user paused this execution.", stopped
                ? "Do not resume this candidate; obtain a new reviewed start if the user restarts."
                : "Resume only through the authorized checkpoint path.");
        }
        if (this.#config.policy.controlLevel === "off") {
            return makeDecision(this.#config, context, "allow", null, "CONTROL_OFF_WITHIN_CORE_CONTRACT", "The action passed permit and projection gates; optional Stop That Shit controls are off.", null);
        }
        const issue = firstPolicyViolation(this.#config, action);
        if (issue) {
            const outcome = outcomeFor(this.#config.policy.controlLevel, issue.certainty);
            return makeDecision(this.#config, context, outcome, issue.category, issue.reasonCode, issue.reason, issue.next);
        }
        return makeDecision(this.#config, context, "allow", null, "WITHIN_CONTRACT", "The action is mapped, permitted, and within the active contract.", null);
    }
}
export function withHostEffect(decision, outcome, evidenceId) {
    if (!isNonEmpty(evidenceId))
        throw new TypeError("Host effect evidence id must be non-empty.");
    return {
        ...clone(decision),
        hostEffect: { outcome, evidenceId }
    };
}
export function withHumanFeedback(decision, label, source) {
    if (!isNonEmpty(source))
        throw new TypeError("Human feedback source must be non-empty.");
    return {
        ...clone(decision),
        feedback: { label, source }
    };
}
// SPDX-License-Identifier: MPL-2.0
