import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Guard } from "../../guard/guard.js";
import { skillIsInPool } from "../../skills/pool.js";
export const CLAUDE_CODE_VERSION = "2.1.260";
export const CLAUDE_CONTRACT_SNAPSHOT = "2026-09-06";
export const CLAUDE_START_SOURCE = "claude-user-prompt-expansion";
export class MemoryClaudePermitStore {
    #permits = new Map();
    read(sessionId) {
        return structuredClone(this.#permits.get(sessionId) ?? null);
    }
    write(sessionId, permit) {
        this.#permits.set(sessionId, structuredClone(permit));
    }
}
function safeSessionName(sessionId) {
    return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown-session";
}
export class FileClaudePermitStore {
    #root;
    constructor(root) {
        this.#root = resolve(root);
    }
    #path(sessionId) {
        return join(this.#root, `${safeSessionName(sessionId)}.json`);
    }
    read(sessionId) {
        try {
            return JSON.parse(readFileSync(this.#path(sessionId), "utf8"));
        }
        catch (error) {
            if (error.code === "ENOENT")
                return null;
            throw error;
        }
    }
    write(sessionId, permit) {
        mkdirSync(this.#root, { recursive: true });
        const target = this.#path(sessionId);
        const temporary = `${target}.${process.pid}.tmp`;
        writeFileSync(temporary, `${JSON.stringify(permit, null, 2)}\n`, "utf8");
        renameSync(temporary, target);
    }
}
function startArgs(candidateVersion) {
    return `start candidate=${candidateVersion}`;
}
function startCommand(candidateVersion) {
    return `/asyoumeant:major-loop-runner ${startArgs(candidateVersion)}`;
}
function now(input) {
    if (input.observed_at && !Number.isNaN(Date.parse(input.observed_at)))
        return input.observed_at;
    return new Date().toISOString();
}
function classify(input) {
    const name = String(input.tool_name || "unknown").toLowerCase();
    if (/^(read|grep|glob|webfetch|websearch)$/.test(name))
        return { kind: "read", mutability: "read" };
    if (/^(write|edit|notebookedit)$/.test(name))
        return { kind: "write", mutability: "write" };
    if (/^(agent|task)$/.test(name))
        return { kind: "delegate", mutability: "write" };
    return { kind: "control", mutability: "unknown" };
}
function targetPaths(input) {
    if (!input || typeof input !== "object")
        return [];
    const record = input;
    return [record.file_path, record.path].filter((value) => typeof value === "string");
}
function action(input, contract) {
    const kind = classify(input);
    return {
        id: String(input.tool_use_id || `${input.session_id || "session"}:tool`),
        workItemId: contract.activeWorkItemId,
        kind: kind.kind,
        mutability: kind.mutability,
        basis: structuredClone(contract.actionBasis),
        targetPaths: targetPaths(input.tool_input),
        dependencyNames: [],
        hashConsumerId: null,
        hardening: false,
        reachability: "reachable",
        delegationCount: kind.kind === "delegate" ? 1 : 0,
        boundedDelegation: kind.kind !== "delegate",
        networkTargets: [],
        externalWriteTargets: [],
        privilegeExpansion: false,
        contradictsUserIntent: false,
        test: null,
        retry: null,
        repeat: null
    };
}
function exactExpansion(input, candidateVersion) {
    return input.hook_event_name === "UserPromptExpansion" &&
        input.expansion_type === "slash_command" &&
        input.command_name === "asyoumeant:major-loop-runner" &&
        input.command_source === "plugin" &&
        input.command_args === startArgs(candidateVersion) &&
        input.prompt === startCommand(candidateVersion);
}
function requestedSkill(input) {
    if (String(input.tool_name || "").toLowerCase() !== "skill")
        return "";
    if (!input.tool_input || typeof input.tool_input !== "object")
        return "";
    const record = input.tool_input;
    return String(record.name ?? record.skill ?? record.id ?? "");
}
export function handleClaudeHook(input, contract, store) {
    const sessionId = String(input.session_id || "");
    const guard = new Guard(contract);
    if (input.hook_event_name === "UserPromptExpansion") {
        if (!exactExpansion(input, contract.candidateVersion)) {
            return { output: null, permit: store.read(sessionId), decision: null, sourceRecognized: false };
        }
        const issuedAt = now(input);
        const command = startCommand(contract.candidateVersion);
        const permit = guard.mintPermit({
            permitId: `claude:${sessionId}:${input.tool_use_id || "expansion"}`,
            candidateVersion: contract.candidateVersion,
            projectionIdentity: contract.projectionIdentity,
            issuedAt,
            expiresAt: new Date(Date.parse(issuedAt) + contract.permitDurationMs).toISOString(),
            nativeStart: {
                host: "claude-code",
                sourceKind: CLAUDE_START_SOURCE,
                command,
                actor: "user",
                adapterVerified: true,
                evidenceId: `claude-user-prompt-expansion:${sessionId}`
            }
        });
        store.write(sessionId, permit);
        return {
            output: {
                hookSpecificOutput: {
                    hookEventName: "UserPromptExpansion",
                    additionalContext: `AsYouMeant permit ACTIVE for ${contract.candidateVersion}.`
                }
            },
            permit,
            decision: null,
            sourceRecognized: true
        };
    }
    if (input.hook_event_name !== "PreToolUse") {
        return { output: null, permit: store.read(sessionId), decision: null, sourceRecognized: false };
    }
    const skillId = requestedSkill(input);
    if (skillId && contract.skillPool && !skillIsInPool(contract.skillPool, skillId)) {
        return {
            output: {
                hookSpecificOutput: {
                    hookEventName: "PreToolUse",
                    permissionDecision: "deny",
                    permissionDecisionReason: `[SKILL_OUT_OF_POOL] ${skillId}`
                }
            },
            permit: store.read(sessionId),
            decision: null,
            sourceRecognized: false
        };
    }
    const permit = store.read(sessionId);
    const decision = guard.decide({
        phase: permit ? "major-loop" : "pre-start",
        now: now(input),
        permit,
        action: action(input, contract)
    });
    if (decision.outcome !== "deny")
        return { output: null, permit, decision, sourceRecognized: false };
    return {
        output: {
            hookSpecificOutput: {
                hookEventName: "PreToolUse",
                permissionDecision: "deny",
                permissionDecisionReason: `[${decision.reasonCode}] ${decision.reason}`
            }
        },
        permit,
        decision,
        sourceRecognized: false
    };
}
// SPDX-License-Identifier: MPL-2.0
