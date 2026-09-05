import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Guard } from "../../guard/guard.js";
export const OPENCODE_VERSION = "1.18.18";
export const OPENCODE_START_SOURCE = "opencode-command-transform";
export const OPENCODE_COMMAND_NAME = "asyoumeant-start";
export class MemoryOpenCodePermitStore {
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
export class FileOpenCodePermitStore {
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
export class OpenCodeGuardDenial extends Error {
    decision;
    constructor(decision) {
        super(`[${decision.reasonCode}] ${decision.reason}`);
        this.name = "OpenCodeGuardDenial";
        this.decision = structuredClone(decision);
    }
}
function expectedArguments(candidateVersion) {
    return `candidate=${candidateVersion}`;
}
function expectedCommand(candidateVersion) {
    return `/${OPENCODE_COMMAND_NAME} ${expectedArguments(candidateVersion)}`;
}
function observedAt(input) {
    if (input.observedAt && !Number.isNaN(Date.parse(input.observedAt)))
        return input.observedAt;
    return new Date().toISOString();
}
function classify(tool) {
    const name = tool.toLowerCase();
    if (/^(read|grep|glob|list|ls)$/.test(name))
        return { kind: "read", mutability: "read" };
    if (/^(write|edit|patch|apply_patch)$/.test(name))
        return { kind: "write", mutability: "write" };
    if (/^(task|agent)$/.test(name))
        return { kind: "delegate", mutability: "write" };
    if (/^(webfetch|websearch)$/.test(name))
        return { kind: "network", mutability: "read" };
    return { kind: "control", mutability: "unknown" };
}
function targetPaths(args) {
    if (!args || typeof args !== "object")
        return [];
    const record = args;
    return [record.filePath, record.file_path, record.path]
        .filter((value) => typeof value === "string");
}
function action(input, output, contract) {
    const kind = classify(input.tool);
    return {
        id: input.callID || `${input.sessionID}:tool`,
        workItemId: contract.activeWorkItemId,
        kind: kind.kind,
        mutability: kind.mutability,
        basis: structuredClone(contract.actionBasis),
        targetPaths: targetPaths(output.args),
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
export function registerOpenCodeCommand(config) {
    config.command ??= {};
    config.command[OPENCODE_COMMAND_NAME] = {
        description: "Start the reviewed AsYouMeant major-loop",
        template: [
            "The user invoked the native AsYouMeant start command with $ARGUMENTS.",
            "Continue only when the native command hook reports a matching active permit."
        ].join(" ")
    };
}
export function handleOpenCodeCommand(input, contract, store) {
    if (input.command !== OPENCODE_COMMAND_NAME ||
        input.arguments !== expectedArguments(contract.candidateVersion)) {
        return { permit: store.read(input.sessionID), sourceRecognized: false };
    }
    const guard = new Guard(contract);
    const issuedAt = observedAt(input);
    const permit = guard.mintPermit({
        permitId: `opencode:${input.sessionID}:${issuedAt}`,
        candidateVersion: contract.candidateVersion,
        projectionIdentity: contract.projectionIdentity,
        issuedAt,
        expiresAt: new Date(Date.parse(issuedAt) + contract.permitDurationMs).toISOString(),
        nativeStart: {
            host: "opencode",
            sourceKind: OPENCODE_START_SOURCE,
            command: expectedCommand(contract.candidateVersion),
            actor: "user",
            adapterVerified: true,
            evidenceId: `opencode-command-execute-before:${input.sessionID}`
        }
    });
    store.write(input.sessionID, permit);
    return { permit, sourceRecognized: true };
}
export function handleOpenCodeTool(input, output, contract, store) {
    const guard = new Guard(contract);
    const permit = store.read(input.sessionID);
    const decision = guard.decide({
        phase: permit ? "major-loop" : "pre-start",
        now: observedAt(input),
        permit,
        action: action(input, output, contract)
    });
    return { permit, decision };
}
export function createOpenCodeHooks(contract, store, onConfig) {
    return {
        config: async (config) => {
            registerOpenCodeCommand(config);
            onConfig?.();
        },
        "command.execute.before": async (input) => {
            handleOpenCodeCommand(input, contract, store);
        },
        "tool.execute.before": async (input, output) => {
            const result = handleOpenCodeTool(input, output, contract, store);
            if (result.decision.outcome === "deny")
                throw new OpenCodeGuardDenial(result.decision);
        }
    };
}
// SPDX-License-Identifier: MPL-2.0
