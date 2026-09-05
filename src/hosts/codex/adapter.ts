import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import { Guard } from "../../guard/guard.js";
import type {
  ActionBasis,
  GuardAction,
  GuardConfig,
  GuardDecision,
  MajorLoopPermit
} from "../../guard/types.js";

export const CODEX_CLI_VERSION = "0.144.3";
export const CODEX_APP_VERSION = "26.825.6671.0";
export const CODEX_START_SOURCE = "codex-user-prompt-submit" as const;

export interface CodexRuntimeContract extends GuardConfig {
  activeWorkItemId: string;
  actionBasis: ActionBasis;
  permitDurationMs: number;
}

export interface CodexHookInput {
  hook_event_name?: string;
  session_id?: string;
  turn_id?: string;
  prompt?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  cwd?: string;
  observed_at?: string;
}

export interface CodexHookOutput {
  hookSpecificOutput: {
    hookEventName: "UserPromptSubmit" | "PreToolUse";
    additionalContext?: string;
    permissionDecision?: "deny";
    permissionDecisionReason?: string;
  };
}

export interface CodexHookResult {
  output: CodexHookOutput | null;
  permit: MajorLoopPermit | null;
  decision: GuardDecision | null;
  sourceRecognized: boolean;
}

export interface CodexPermitStore {
  read(sessionId: string): MajorLoopPermit | null;
  write(sessionId: string, permit: MajorLoopPermit): void;
}

export class MemoryCodexPermitStore implements CodexPermitStore {
  readonly #permits = new Map<string, MajorLoopPermit>();

  read(sessionId: string): MajorLoopPermit | null {
    return structuredClone(this.#permits.get(sessionId) ?? null);
  }

  write(sessionId: string, permit: MajorLoopPermit): void {
    this.#permits.set(sessionId, structuredClone(permit));
  }
}

function safeSessionName(sessionId: string): string {
  const normalized = sessionId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return normalized || "unknown-session";
}

export class FileCodexPermitStore implements CodexPermitStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = resolve(root);
  }

  #path(sessionId: string): string {
    return join(this.#root, `${safeSessionName(sessionId)}.json`);
  }

  read(sessionId: string): MajorLoopPermit | null {
    try {
      return JSON.parse(readFileSync(this.#path(sessionId), "utf8")) as MajorLoopPermit;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return null;
      throw error;
    }
  }

  write(sessionId: string, permit: MajorLoopPermit): void {
    mkdirSync(this.#root, { recursive: true });
    const target = this.#path(sessionId);
    const temporary = `${target}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(permit, null, 2)}\n`, "utf8");
    renameSync(temporary, target);
  }
}

function exactStartCommand(candidateVersion: string): string {
  return `$major-loop-runner start candidate=${candidateVersion}`;
}

function isoNow(input: CodexHookInput): string {
  if (input.observed_at && !Number.isNaN(Date.parse(input.observed_at))) return input.observed_at;
  return new Date().toISOString();
}

function extractCommand(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  for (const key of ["cmd", "command", "chars"]) {
    if (typeof record[key] === "string") return record[key];
  }
  return "";
}

function extractPaths(input: unknown, cwd: string | undefined): string[] {
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  const found = new Set<string>();
  for (const key of ["path", "file", "file_path", "workdir"]) {
    if (typeof record[key] === "string" && record[key]) found.add(record[key]);
  }
  const patch = typeof record.patch === "string" ? record.patch : "";
  for (const match of patch.matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)) found.add(match[1] ?? "");
  return [...found].filter(Boolean).map((value) => {
    const absolute = resolve(cwd || process.cwd(), value);
    const local = relative(cwd || process.cwd(), absolute).replace(/\\/g, "/");
    return local || basename(absolute);
  });
}

function classify(input: CodexHookInput): Pick<GuardAction, "kind" | "mutability"> {
  const name = String(input.tool_name || "unknown").toLowerCase();
  const command = extractCommand(input.tool_input).toLowerCase();
  if (/delegate|subagent|task/.test(name)) return { kind: "delegate", mutability: "write" };
  if (/apply_patch|write|edit|delete|move/.test(name)) return { kind: "write", mutability: "write" };
  if (/read|view|search|find|list|get_|status/.test(name)) return { kind: "read", mutability: "read" };
  if (/\b(?:pnpm|npm|yarn)\s+(?:add|install|remove|uninstall|update)\b/.test(command)) {
    return { kind: "dependency", mutability: "write" };
  }
  if (/\b(?:test|verify|conformance)\b/.test(command)) return { kind: "test", mutability: "write" };
  if (/\b(?:sha\d*sum|certutil\s+-hashfile|createhash)\b/.test(command)) return { kind: "hash", mutability: "read" };
  if (/\bgit\s+push\b|\bgh\s+(?:repo|pr|release)\b/.test(command)) {
    return { kind: "external-write", mutability: "write" };
  }
  if (/https?:\/\//.test(command)) return { kind: "network", mutability: "unknown" };
  return { kind: "control", mutability: "unknown" };
}

function dependencyNames(command: string, allowed: readonly string[]): string[] {
  return allowed.filter((name) => command.includes(name.toLowerCase()));
}

function networkTargets(command: string): string[] {
  const found = new Set<string>();
  for (const match of command.matchAll(/https?:\/\/([^\s/"']+)/gi)) found.add(match[1] ?? "");
  return [...found].filter(Boolean);
}

function toGuardAction(input: CodexHookInput, contract: CodexRuntimeContract): GuardAction {
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

function context(event: "UserPromptSubmit" | "PreToolUse", text: string): CodexHookOutput {
  return { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
}

export function handleCodexHook(
  input: CodexHookInput,
  contract: CodexRuntimeContract,
  store: CodexPermitStore
): CodexHookResult {
  const sessionId = String(input.session_id || "");
  const guard = new Guard(contract);
  const expectedCommand = exactStartCommand(contract.candidateVersion);

  if (input.hook_event_name === "UserPromptSubmit") {
    if (input.prompt !== expectedCommand) {
      return { output: null, permit: store.read(sessionId), decision: null, sourceRecognized: false };
    }
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

  const permit = store.read(sessionId);
  const decision = guard.decide({
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
          permissionDecisionReason: `[${decision.reasonCode}] ${decision.reason}`
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
