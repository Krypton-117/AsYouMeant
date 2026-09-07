// SPDX-License-Identifier: MPL-2.0
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
export function unreviewedContract(host, sourceKind) {
    return {
        candidateVersion: "unreviewed", projectionIdentity: "unreviewed",
        review: { result: "PRE_LOOP_REVIEW_FAILED", candidateVersion: "unreviewed", projectionIdentity: "unreviewed" },
        nativeStartPaths: [{ host, sourceKind, command: "Complete pre-loop to obtain a candidate-specific native start command" }],
        activeWorkItemId: "pre-loop", actionBasis: { kind: "requested", requirementIds: ["user"] }, permitDurationMs: 3600000,
        policy: { taskMode: "change", controlLevel: "hard-lock", executionState: "active",
            allowedWorkItemIds: ["pre-loop"], allowedPaths: [], dependencyPolicy: "deny", allowedDependencies: [],
            hashPolicy: "deny", allowedHashConsumerIds: [], agentBudget: 0, agentsUsed: 0, allowedTestIds: [], retryBudget: 0,
            allowedNetworkTargets: [], allowedExternalWriteTargets: [], deliveryAllowed: false }
    };
}
// Only direct user prompt events may call this parser. Mentions, quotes and code
// blocks elsewhere in a prompt are not activation evidence.
export function requestedMode(prompt) {
    const text = prompt.trim();
    const exact = /^(?:AYM mode |\/asyoumeant-mode )(ordinary|research|aym)$/i.exec(text);
    if (exact)
        return exact[1].toLowerCase();
    if (/^(?:退出|关闭|停止使用)\s*AYM[。.!！]?$/i.test(text))
        return "ordinary";
    if (/^(?:只读研究|研究模式)[。.!！]?$/.test(text))
        return "research";
    if (/^(?:(?:请)?(?:使用\s*(?:AYM|AsYouMeant|pre-loop)|进入\s*major-loop|按\s*AYM\s*合同开发)|use\s+(?:AYM|AsYouMeant|pre-loop)\b|enter\s+major-loop\b)/i.test(text))
        return "aym";
    return null;
}
export class MemorySessionStore {
    #permits = new Map();
    #modes = new Map();
    read(session) { return structuredClone(this.#permits.get(session) ?? null); }
    write(session, permit) { this.#permits.set(session, structuredClone(permit)); }
    mode(session) { return this.#modes.get(session) ?? "ordinary"; }
    setMode(session, mode) {
        if (!session)
            throw new Error("A native session identity is required to change AYM mode.");
        this.#permits.delete(session);
        this.#modes.set(session, mode);
    }
}
export class FileSessionStore {
    #root;
    constructor(root) { this.#root = resolve(root); }
    #path(session, suffix = "") {
        if (!session)
            throw new Error("A native session identity is required to persist AYM mode or permit.");
        return join(this.#root, `${Buffer.from(session).toString("hex")}${suffix}.json`);
    }
    #read(session, suffix = "") {
        if (!session)
            return null;
        try {
            return JSON.parse(readFileSync(this.#path(session, suffix), "utf8"));
        }
        catch (error) {
            if (error.code === "ENOENT")
                return null;
            throw error;
        }
    }
    #write(session, value, suffix = "") {
        const target = this.#path(session, suffix);
        mkdirSync(this.#root, { recursive: true });
        const temporary = `${target}.${process.pid}.tmp`;
        writeFileSync(temporary, JSON.stringify(value), "utf8");
        renameSync(temporary, target);
    }
    read(session) { return this.#read(session); }
    write(session, permit) { this.#write(session, permit); }
    mode(session) {
        const value = this.#read(session, ".mode");
        if (value === null)
            return "ordinary";
        if (value === "ordinary" || value === "research" || value === "aym")
            return value;
        throw new Error("Invalid persisted AYM session mode.");
    }
    setMode(session, mode) {
        rmSync(this.#path(session), { force: true });
        this.#write(session, mode, ".mode");
    }
}
export function readOnlyTool(tool, input) {
    const name = tool.toLowerCase();
    if (["exec_command", "bash", "shell", "shell_command"].includes(name)) {
        if (!input || typeof input !== "object")
            return false;
        const args = input;
        const command = args.cmd ?? args.command;
        if (typeof command !== "string" || /[\r\n;$`|&<>()[\]{}]/.test(command))
            return false;
        // A deliberately small command grammar, not a general shell safety parser.
        // No pipelines, substitutions, scripts, rg preprocessors or write options.
        const tokens = command.trim().match(/'[^']*'|"[^"]*"|[^\s'"]+/g) ?? [];
        if (tokens.join(" ") !== command.trim().replace(/\s+/g, " "))
            return false;
        const executable = tokens.shift()?.toLowerCase();
        if (!executable || !["cat", "get-content", "rg"].includes(executable) || !tokens.length)
            return false;
        const options = executable === "rg" ? ["--files", "--hidden", "-n", "-i", "--"] : executable === "get-content" ? ["-path", "-literalpath", "-totalcount", "-raw"] : ["--"];
        return tokens.every((token) => {
            const value = token.replace(/^(['"])(.*)\1$/, "$2");
            return !value.startsWith("-") || options.includes(value.toLowerCase());
        });
    }
    if (/^(?:read|read_file|read_image|view_image|grep|glob|list|ls|webfetch|websearch|web_search)$/.test(name))
        return true;
    if (name === "web.run" || name === "web__run") {
        if (!input || typeof input !== "object" || Array.isArray(input))
            return false;
        const keys = Object.keys(input);
        return keys.length > 0 && keys.every((key) => ["search_query", "open", "click", "find", "screenshot", "image_query", "finance", "weather", "sports", "time", "response_length"].includes(key));
    }
    return false;
}
