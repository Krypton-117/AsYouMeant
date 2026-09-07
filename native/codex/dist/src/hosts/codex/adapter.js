import { MemorySessionStore, FileSessionStore, requestedMode, readOnlyTool } from "../../guard/session.js";
import { basename, relative, resolve } from "node:path";
import { Guard } from "../../guard/guard.js";
import { skillIsInPool } from "../../skills/pool.js";
export const CODEX_CLI_VERSION = "0.144.3";
export const CODEX_APP_VERSION = "26.825.6671.0";
export const CODEX_START_SOURCE = "codex-user-prompt-submit";
export class MemoryCodexPermitStore extends MemorySessionStore {
}
export class FileCodexPermitStore extends FileSessionStore {
}
function exactStartCommand(candidateVersion) {
    return `$major-loop-runner start candidate=${candidateVersion}`;
}
function isoNow(input) {
    if (input.observed_at && !Number.isNaN(Date.parse(input.observed_at)))
        return input.observed_at;
    return new Date().toISOString();
}
function extractCommand(input) {
    if (!input || typeof input !== "object")
        return "";
    const record = input;
    for (const key of ["cmd", "command", "chars"]) {
        if (typeof record[key] === "string")
            return record[key];
    }
    return "";
}
function extractPaths(input, cwd) {
    if (!input || typeof input !== "object")
        return [];
    const record = input;
    const found = new Set();
    for (const key of ["path", "file", "file_path", "workdir"]) {
        if (typeof record[key] === "string" && record[key])
            found.add(record[key]);
    }
    const patch = typeof record.patch === "string" ? record.patch : "";
    for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm))
        found.add(match[1] ?? "");
    return [...found].filter(Boolean).map((value) => {
        const absolute = resolve(cwd || process.cwd(), value);
        const local = relative(cwd || process.cwd(), absolute).replace(/\\/g, "/");
        return local || basename(absolute);
    });
}
function classify(input) {
    if (readOnlyTool(String(input.tool_name ?? ""), input.tool_input))
        return { kind: "read", mutability: "read" };
    const name = String(input.tool_name || "unknown").toLowerCase();
    const command = extractCommand(input.tool_input).toLowerCase();
    if (/^(delegate|subagent|task|spawn_agent)$/.test(name))
        return { kind: "delegate", mutability: "write" };
    if (/^(apply_patch|write|edit|delete|move)$/.test(name))
        return { kind: "write", mutability: "write" };
    if (!/^(exec_command|bash|shell|shell_command)$/.test(name) || /[\r\n;&|<>$`]/.test(command))
        return { kind: "control", mutability: "unknown" };
    if (/\b(?:pnpm|npm|yarn)\s+(?:add|install|remove|uninstall|update)\b/.test(command)) {
        return { kind: "dependency", mutability: "write" };
    }
    if (/\b(?:test|verify|conformance)\b/.test(command))
        return { kind: "test", mutability: "write" };
    if (/\b(?:sha\d*sum|certutil\s+-hashfile|createhash)\b/.test(command))
        return { kind: "hash", mutability: "read" };
    if (/\bgit\s+push\b|\bgh\s+(?:repo|pr|release)\b/.test(command)) {
        return { kind: "external-write", mutability: "write" };
    }
    if (/https?:\/\//.test(command))
        return { kind: "network", mutability: "unknown" };
    return { kind: "control", mutability: "unknown" };
}
function dependencyNames(command, allowed) {
    return allowed.filter((name) => command.includes(name.toLowerCase()));
}
function networkTargets(command) {
    const found = new Set();
    for (const match of command.matchAll(/https?:\/\/([^\s/"']+)/gi))
        found.add(match[1] ?? "");
    return [...found].filter(Boolean);
}
function toGuardAction(input, contract) {
    const classification = classify(input);
    const command = extractCommand(input.tool_input);
    const actionId = String(input.tool_use_id || input.turn_id || `${input.session_id || "session"}:action`);
    const isTest = classification.kind === "test";
    return {
        id: actionId,
        workItemId: contract.activeWorkItemId,
        kind: classification.kind,
        mutability: classification.mutability,
        basis: structuredClone(contract.actionBasis),
        targetPaths: extractPaths(input.tool_input, input.cwd),
        dependencyNames: dependencyNames(command.toLowerCase(), contract.policy.allowedDependencies),
        hashConsumerId: null,
        hardening: false,
        reachability: "reachable",
        delegationCount: classification.kind === "delegate" ? 1 : 0,
        boundedDelegation: classification.kind !== "delegate",
        networkTargets: networkTargets(command),
        externalWriteTargets: classification.kind === "external-write" ? networkTargets(command) : [],
        privilegeExpansion: false,
        contradictsUserIntent: false,
        test: isTest ? {
            testId: contract.policy.allowedTestIds[0] ?? "unmapped-test",
            classification: "acceptance",
            consumerNodeId: contract.activeWorkItemId,
            implementationIdentity: contract.projectionIdentity,
            hasEquivalentValidEvidence: false,
            relevantChange: true,
            contractRequiresRepeat: false,
            failureEvidenceId: null,
            hypothesisIds: [],
            discriminating: false
        } : null,
        retry: null,
        repeat: null
    };
}
function context(event, text) {
    return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}
function requestedSkill(input) {
    if (String(input.tool_name || "").toLowerCase() !== "skill")
        return "";
    if (!input.tool_input || typeof input.tool_input !== "object")
        return "";
    const record = input.tool_input;
    return String(record.name ?? record.skill ?? record.id ?? "");
}
export function handleCodexHook(input, contract, store) {
    const sessionId = String(input.session_id || "");
    const guard = new Guard(contract);
    if (input.hook_event_name === "UserPromptSubmit") {
        const mode = requestedMode(input.prompt ?? "");
        if (mode && sessionId)
            store.setMode(sessionId, mode);
    }
    const expectedCommand = exactStartCommand(contract.candidateVersion);
    if (input.hook_event_name === "UserPromptSubmit") {
        if (input.prompt !== expectedCommand) {
            return { output: null, permit: store.read(sessionId), decision: null, sourceRecognized: false };
        }
        store.setMode(sessionId, "aym");
        const issuedAt = isoNow(input);
        const permit = guard.mintPermit({
            permitId: `codex:${sessionId}:${input.turn_id || "turn"}`,
            candidateVersion: contract.candidateVersion,
            projectionIdentity: contract.projectionIdentity,
            issuedAt,
            expiresAt: new Date(Date.parse(issuedAt) + contract.permitDurationMs).toISOString(),
            nativeStart: {
                host: "codex",
                sourceKind: CODEX_START_SOURCE,
                command: expectedCommand,
                actor: "user",
                adapterVerified: true,
                evidenceId: `codex-user-prompt-submit:${input.turn_id || "turn"}`
            }
        });
        store.write(sessionId, permit);
        return {
            output: context("UserPromptSubmit", `AsYouMeant permit ACTIVE for ${contract.candidateVersion}.`),
            permit,
            decision: null,
            sourceRecognized: true
        };
    }
    if (input.hook_event_name !== "PreToolUse") {
        return { output: null, permit: store.read(sessionId), decision: null, sourceRecognized: false };
    }
    const skillId = requestedSkill(input);
    if (store.mode(sessionId) === "aym" && skillId && contract.skillPool && !skillIsInPool(contract.skillPool, skillId)) {
        return {
            output: {
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `[SKILL_OUT_OF_POOL] Action skill ${skillId}; mode=aym. Skill permission is absent. Revise pre-loop and independent review, then use ${exactStartCommand(contract.candidateVersion)}. Read-only tools remain available; send AYM mode research or AYM mode ordinary to switch.`
                }
            },
            permit: store.read(sessionId),
            decision: null,
            sourceRecognized: false
        };
    }
    const permit = store.read(sessionId);
    const decision = guard.decide({
        governanceMode: store.mode(sessionId),
        phase: permit ? "major-loop" : "pre-start",
        now: isoNow(input),
        permit,
        action: toGuardAction(input, contract)
    });
    if (decision.outcome === "deny") {
        return {
            output: {
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `[${decision.reasonCode}] ${input.tool_name}: ${decision.reason} ${decision.next ?? ""}`
                }
            },
            permit,
            decision,
            sourceRecognized: false
        };
    }
    if (decision.outcome === "observe") {
        return {
            output: context("PreToolUse", `AsYouMeant observed ${decision.reasonCode}; host effect remains unobserved.`),
            permit,
            decision,
            sourceRecognized: false
        };
    }
    return { output: null, permit, decision, sourceRecognized: false };
}
// SPDX-License-Identifier: MPL-2.0
