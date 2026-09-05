import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { Guard } from "../../guard/guard.js";
import type {
  ActionBasis,
  GuardAction,
  GuardConfig,
  GuardDecision,
  MajorLoopPermit
} from "../../guard/types.js";

export const CLAUDE_CODE_VERSION = "2.1.260";
export const CLAUDE_CONTRACT_SNAPSHOT = "2026-09-04";
export const CLAUDE_START_SOURCE = "claude-user-prompt-expansion" as const;

export interface ClaudeRuntimeContract extends GuardConfig {
  activeWorkItemId: string;
  actionBasis: ActionBasis;
  permitDurationMs: number;
}

export interface ClaudeHookInput {
  hook_event_name?: string;
  session_id?: string;
  prompt?: string;
  expansion_type?: string;
  command_name?: string;
  command_args?: string;
  command_source?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  cwd?: string;
  observed_at?: string;
}

export interface ClaudeHookOutput {
  hookSpecificOutput: {
    hookEventName: "UserPromptExpansion" | "PreToolUse";
    additionalContext?: string;
    permissionDecision?: "deny";
    permissionDecisionReason?: string;
  };
}

export interface ClaudeHookResult {
  output: ClaudeHookOutput | null;
  permit: MajorLoopPermit | null;
  decision: GuardDecision | null;
  sourceRecognized: boolean;
}

export interface ClaudePermitStore {
  read(sessionId: string): MajorLoopPermit | null;
  write(sessionId: string, permit: MajorLoopPermit): void;
}

export class MemoryClaudePermitStore implements ClaudePermitStore {
  readonly #permits = new Map<string, MajorLoopPermit>();

  read(sessionId: string): MajorLoopPermit | null {
    return structuredClone(this.#permits.get(sessionId) ?? null);
  }

  write(sessionId: string, permit: MajorLoopPermit): void {
    this.#permits.set(sessionId, structuredClone(permit));
  }
}

function safeSessionName(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9._-]/g, "_") || "unknown-session";
}

export class FileClaudePermitStore implements ClaudePermitStore {
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
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
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

function startArgs(candidateVersion: string): string {
  return `start candidate=${candidateVersion}`;
}

function startCommand(candidateVersion: string): string {
  return `/asyoumeant:major-loop-runner ${startArgs(candidateVersion)}`;
}

function now(input: ClaudeHookInput): string {
  if (input.observed_at && !Number.isNaN(Date.parse(input.observed_at))) return input.observed_at;
  return new Date().toISOString();
}

function classify(input: ClaudeHookInput): Pick<GuardAction, "kind" | "mutability"> {
  const name = String(input.tool_name || "unknown").toLowerCase();
  if (/^(read|grep|glob|webfetch|websearch)$/.test(name)) return { kind: "read", mutability: "read" };
  if (/^(write|edit|notebookedit)$/.test(name)) return { kind: "write", mutability: "write" };
  if (/^(agent|task)$/.test(name)) return { kind: "delegate", mutability: "write" };
  return { kind: "control", mutability: "unknown" };
}

function targetPaths(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];
  const record = input as Record<string, unknown>;
  return [record.file_path, record.path].filter((value): value is string => typeof value === "string");
}

function action(input: ClaudeHookInput, contract: ClaudeRuntimeContract): GuardAction {
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

function exactExpansion(input: ClaudeHookInput, candidateVersion: string): boolean {
  return input.hook_event_name === "UserPromptExpansion" &&
    input.expansion_type === "slash_command" &&
    input.command_name === "asyoumeant:major-loop-runner" &&
    input.command_source === "plugin" &&
    input.command_args === startArgs(candidateVersion) &&
    input.prompt === startCommand(candidateVersion);
}

export function handleClaudeHook(
  input: ClaudeHookInput,
  contract: ClaudeRuntimeContract,
  store: ClaudePermitStore
): ClaudeHookResult {
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
  const permit = store.read(sessionId);
  const decision = guard.decide({
    phase: permit ? "major-loop" : "pre-start",
    now: now(input),
    permit,
    action: action(input, contract)
  });
  if (decision.outcome !== "deny") return { output: null, permit, decision, sourceRecognized: false };
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
