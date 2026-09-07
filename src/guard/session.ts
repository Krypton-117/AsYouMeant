// SPDX-License-Identifier: MPL-2.0
import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { MajorLoopPermit, HostId, NativeStartSourceKind } from "./types.js";

export function unreviewedContract(host: HostId, sourceKind: NativeStartSourceKind) {
  return {
    candidateVersion: "unreviewed", projectionIdentity: "unreviewed",
    review: { result: "PRE_LOOP_REVIEW_FAILED" as const, candidateVersion: "unreviewed", projectionIdentity: "unreviewed" },
    nativeStartPaths: [{ host, sourceKind, command: "Complete pre-loop to obtain a candidate-specific native start command" }],
    activeWorkItemId: "pre-loop", actionBasis: { kind: "requested" as const, requirementIds: ["user"] }, permitDurationMs: 3600000,
    policy: { taskMode: "change" as const, controlLevel: "hard-lock" as const, executionState: "active" as const,
      allowedWorkItemIds: ["pre-loop"], allowedPaths: [], dependencyPolicy: "deny" as const, allowedDependencies: [],
      hashPolicy: "deny" as const, allowedHashConsumerIds: [], agentBudget: 0, agentsUsed: 0, allowedTestIds: [], retryBudget: 0,
      allowedNetworkTargets: [], allowedExternalWriteTargets: [], deliveryAllowed: false }
  };
}

export type GovernanceMode = "ordinary" | "research" | "aym";
export interface SessionStore {
  read(session: string): MajorLoopPermit | null;
  write(session: string, permit: MajorLoopPermit): void;
  mode(session: string): GovernanceMode;
  setMode(session: string, mode: GovernanceMode): void;
}

// Only direct user prompt events may call this parser. Mentions, quotes and code
// blocks elsewhere in a prompt are not activation evidence.
export function requestedMode(prompt: string): GovernanceMode | null {
  const text = prompt.trim();
  const exact = /^(?:AYM mode |\/asyoumeant-mode )(ordinary|research|aym)$/i.exec(text);
  if (exact) return exact[1]!.toLowerCase() as GovernanceMode;
  if (/^(?:退出|关闭|停止使用)\s*AYM[。.!！]?$/i.test(text)) return "ordinary";
  if (/^(?:只读研究|研究模式)[。.!！]?$/.test(text)) return "research";
  if (/^(?:(?:请)?(?:使用\s*(?:AYM|AsYouMeant|pre-loop)|进入\s*major-loop|按\s*AYM\s*合同开发)|use\s+(?:AYM|AsYouMeant|pre-loop)\b|enter\s+major-loop\b)/i.test(text)) return "aym";
  return null;
}

export class MemorySessionStore implements SessionStore {
  readonly #permits = new Map<string, MajorLoopPermit>();
  readonly #modes = new Map<string, GovernanceMode>();
  read(session: string): MajorLoopPermit | null { return structuredClone(this.#permits.get(session) ?? null); }
  write(session: string, permit: MajorLoopPermit): void { this.#permits.set(session, structuredClone(permit)); }
  mode(session: string): GovernanceMode { return this.#modes.get(session) ?? "ordinary"; }
  setMode(session: string, mode: GovernanceMode): void {
    if (!session) throw new Error("A native session identity is required to change AYM mode.");
    this.#permits.delete(session);
    this.#modes.set(session, mode);
  }
}

export class FileSessionStore implements SessionStore {
  readonly #root: string;
  constructor(root: string) { this.#root = resolve(root); }
  #path(session: string, suffix = ""): string {
    if (!session) throw new Error("A native session identity is required to persist AYM mode or permit.");
    return join(this.#root, `${Buffer.from(session).toString("hex")}${suffix}.json`);
  }
  #read(session: string, suffix = ""): unknown {
    if (!session) return null;
    try { return JSON.parse(readFileSync(this.#path(session, suffix), "utf8")); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  #write(session: string, value: unknown, suffix = ""): void {
    const target = this.#path(session, suffix);
    mkdirSync(this.#root, { recursive: true });
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(value), "utf8");
    renameSync(temporary, target);
  }
  read(session: string): MajorLoopPermit | null { return this.#read(session) as MajorLoopPermit | null; }
  write(session: string, permit: MajorLoopPermit): void { this.#write(session, permit); }
  mode(session: string): GovernanceMode {
    const value = this.#read(session, ".mode");
    if (value === null) return "ordinary";
    if (value === "ordinary" || value === "research" || value === "aym") return value;
    throw new Error("Invalid persisted AYM session mode.");
  }
  setMode(session: string, mode: GovernanceMode): void {
    rmSync(this.#path(session), { force: true });
    this.#write(session, mode, ".mode");
  }
}

export function readOnlyTool(tool: string, input: unknown): boolean {
  const name = tool.toLowerCase();
  if (["exec_command", "bash", "shell", "shell_command"].includes(name)) {
    if (!input || typeof input !== "object") return false;
    const args = input as Record<string, unknown>;
    const command = args.cmd ?? args.command;
    if (typeof command !== "string" || /[\r\n;$`|&<>()[\]{}]/.test(command)) return false;
    // A deliberately small command grammar, not a general shell safety parser.
    // No pipelines, substitutions, scripts, rg preprocessors or write options.
    const tokens = command.trim().match(/'[^']*'|"[^"]*"|[^\s'"]+/g) ?? [];
    if (tokens.join(" ") !== command.trim().replace(/\s+/g, " ")) return false;
    const executable = tokens.shift()?.toLowerCase();
    if (!executable || !["cat", "get-content", "rg"].includes(executable) || !tokens.length) return false;
    const options = executable === "rg" ? ["--files", "--hidden", "-n", "-i", "--"] : executable === "get-content" ? ["-path", "-literalpath", "-totalcount", "-raw"] : ["--"];
    return tokens.every((token) => {
      const value = token.replace(/^(['"])(.*)\1$/, "$2");
      return !value.startsWith("-") || options.includes(value.toLowerCase());
    });
  }
  if (/^(?:read|read_file|read_image|view_image|grep|glob|list|ls|webfetch|websearch|web_search)$/.test(name)) return true;
  if (name === "web.run" || name === "web__run") {
    if (!input || typeof input !== "object" || Array.isArray(input)) return false;
    const keys = Object.keys(input);
    return keys.length > 0 && keys.every((key) => ["search_query", "open", "click", "find", "screenshot", "image_query", "finance", "weather", "sports", "time", "response_length"].includes(key));
  }
  return false;
}
