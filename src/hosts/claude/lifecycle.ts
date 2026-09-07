import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { CLAUDE_CODE_VERSION, CLAUDE_CONTRACT_SNAPSHOT } from "./adapter.js";

export interface ClaudeContractVerification {
  hostVersion: string;
  contractSnapshot: string;
  manifest: boolean;
  namespacedSkill: boolean;
  userOnlyStart: boolean;
  sourceHook: boolean;
  guardHook: boolean;
  execForm: boolean;
  installCommand: string;
  uninstallCommand: string;
  realHostTested: false;
  label: "contract-verified-not-real-host-tested";
}

function requireChild(child: string, parent: string): void {
  const local = relative(resolve(parent), resolve(child));
  if (!local || local.startsWith("..") || isAbsolute(local)) throw new Error("Claude package must be inside the repository.");
}

export function prepareClaudePluginPackage(repositoryRoot: string, packageRoot: string): void {
  requireChild(packageRoot, repositoryRoot);
  const files = [
    [join(repositoryRoot, "dist", "src", "guard", "session.js"), join(packageRoot, "dist", "src", "guard", "session.js")],
    [join(repositoryRoot, "dist", "src", "guard", "guard.js"), join(packageRoot, "dist", "src", "guard", "guard.js")],
    [join(repositoryRoot, "dist", "src", "skills", "pool.js"), join(packageRoot, "dist", "src", "skills", "pool.js")],
    [join(repositoryRoot, "dist", "src", "hosts", "claude", "adapter.js"), join(packageRoot, "dist", "src", "hosts", "claude", "adapter.js")]
  ] as const;
  for (const [source, target] of files) {
    if (!existsSync(source)) throw new Error(`Claude package input is missing: ${source}`);
    mkdirSync(resolve(target, ".."), { recursive: true });
    copyFileSync(source, target);
  }
}

export function verifyClaudePluginContract(packageRoot: string): ClaudeContractVerification {
  const manifest = JSON.parse(readFileSync(join(packageRoot, ".claude-plugin", "plugin.json"), "utf8")) as Record<string, unknown>;
  const skill = readFileSync(join(packageRoot, "skills", "major-loop-runner", "SKILL.md"), "utf8");
  const hooks = JSON.parse(readFileSync(join(packageRoot, "hooks", "hooks.json"), "utf8")) as {
    hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<Record<string, unknown>> }>>;
  };
  const expansion = hooks.hooks?.UserPromptExpansion?.[0];
  const preTool = hooks.hooks?.PreToolUse?.[0];
  const commands = [...(expansion?.hooks ?? []), ...(preTool?.hooks ?? [])];
  const result: ClaudeContractVerification = {
    hostVersion: CLAUDE_CODE_VERSION,
    contractSnapshot: CLAUDE_CONTRACT_SNAPSHOT,
    manifest: manifest.name === "asyoumeant" && manifest.version === "0.3.1" && manifest.hooks === "./hooks/hooks.json",
    namespacedSkill: expansion?.matcher === "asyoumeant:major-loop-runner",
    userOnlyStart: /disable-model-invocation:\s*true/.test(skill),
    sourceHook: Boolean(expansion),
    guardHook: preTool?.matcher === "*",
    execForm: commands.length === 2 && commands.every((command) => command.type === "command" && command.command === "node" && Array.isArray(command.args)),
    installCommand: "claude plugin install asyoumeant@asyoumeant --scope user",
    uninstallCommand: "claude plugin uninstall asyoumeant@asyoumeant --scope user",
    realHostTested: false,
    label: "contract-verified-not-real-host-tested"
  };
  if (Object.entries(result).some(([key, value]) => typeof value === "boolean" && key !== "realHostTested" && !value)) {
    throw new Error(`Claude contract verification failed: ${JSON.stringify(result)}`);
  }
  return result;
}
// SPDX-License-Identifier: MPL-2.0
