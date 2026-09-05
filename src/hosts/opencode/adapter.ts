import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { Config, Hooks } from "@opencode-ai/plugin";

import { Guard } from "../../guard/guard.js";
import type {
  ActionBasis,
  GuardAction,
  GuardConfig,
  GuardDecision,
  MajorLoopPermit
} from "../../guard/types.js";

export const OPENCODE_VERSION = "1.18.18";
export const OPENCODE_START_SOURCE = "opencode-command-transform" as const;
export const OPENCODE_COMMAND_NAME = "asyoumeant-start";

export interface OpenCodeRuntimeContract extends GuardConfig {
  activeWorkItemId: string;
  actionBasis: ActionBasis;
  permitDurationMs: number;
}

export interface OpenCodeCommandInput {
  command: string;
  sessionID: string;
  arguments: string;
  observedAt?: string;
}

export interface OpenCodeToolInput {
  tool: string;
  sessionID: string;
  callID: string;
  observedAt?: string;
}

export interface OpenCodeToolOutput {
  args: unknown;
}

export interface OpenCodeCommandResult {
  permit: MajorLoopPermit | null;
  sourceRecognized: boolean;
}

export interface OpenCodeToolResult {
  permit: MajorLoopPermit | null;
  decision: GuardDecision;
}

export interface OpenCodePermitStore {
  read(sessionId: string): MajorLoopPermit | null;
  write(sessionId: string, permit: MajorLoopPermit): void;
}

export class MemoryOpenCodePermitStore implements OpenCodePermitStore {
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

export class FileOpenCodePermitStore implements OpenCodePermitStore {
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

export class OpenCodeGuardDenial extends Error {
  readonly decision: GuardDecision;

  constructor(decision: GuardDecision) {
    super(`[${decision.reasonCode}] ${decision.reason}`);
    this.name = "OpenCodeGuardDenial";
    this.decision = structuredClone(decision);
  }
}

function expectedArguments(candidateVersion: string): string {
  return `candidate=${candidateVersion}`;
}

function expectedCommand(candidateVersion: string): string {
  return `/${OPENCODE_COMMAND_NAME} ${expectedArguments(candidateVersion)}`;
}

function observedAt(input: { observedAt?: string }): string {
  if (input.observedAt && !Number.isNaN(Date.parse(input.observedAt))) return input.observedAt;
  return new Date().toISOString();
}

function classify(tool: string): Pick<GuardAction, "kind" | "mutability"> {
  const name = tool.toLowerCase();
  if (/^(read|grep|glob|list|ls)$/.test(name)) return { kind: "read", mutability: "read" };
  if (/^(write|edit|patch|apply_patch)$/.test(name)) return { kind: "write", mutability: "write" };
  if (/^(task|agent)$/.test(name)) return { kind: "delegate", mutability: "write" };
  if (/^(webfetch|websearch)$/.test(name)) return { kind: "network", mutability: "read" };
  return { kind: "control", mutability: "unknown" };
}

function targetPaths(args: unknown): string[] {
  if (!args || typeof args !== "object") return [];
  const record = args as Record<string, unknown>;
  return [record.filePath, record.file_path, record.path]
    .filter((value): value is string => typeof value === "string");
}

function action(
  input: OpenCodeToolInput,
  output: OpenCodeToolOutput,
  contract: OpenCodeRuntimeContract
): GuardAction {
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

export function registerOpenCodeCommand(config: Config): void {
  config.command ??= {};
  config.command[OPENCODE_COMMAND_NAME] = {
    description: "Start the reviewed AsYouMeant major-loop",
    template: [
      "The user invoked the native AsYouMeant start command with $ARGUMENTS.",
      "Continue only when the native command hook reports a matching active permit."
    ].join(" ")
  };
}

export function handleOpenCodeCommand(
  input: OpenCodeCommandInput,
  contract: OpenCodeRuntimeContract,
  store: OpenCodePermitStore
): OpenCodeCommandResult {
  if (
    input.command !== OPENCODE_COMMAND_NAME ||
    input.arguments !== expectedArguments(contract.candidateVersion)
  ) {
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

export function handleOpenCodeTool(
  input: OpenCodeToolInput,
  output: OpenCodeToolOutput,
  contract: OpenCodeRuntimeContract,
  store: OpenCodePermitStore
): OpenCodeToolResult {
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

export function createOpenCodeHooks(
  contract: OpenCodeRuntimeContract,
  store: OpenCodePermitStore,
  onConfig?: () => void
): Hooks {
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
      if (result.decision.outcome === "deny") throw new OpenCodeGuardDenial(result.decision);
    }
  };
}
