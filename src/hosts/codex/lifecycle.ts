import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { CODEX_CLI_VERSION } from "./adapter.js";

export interface CodexCommand {
  executable: string;
  prefixArgs: string[];
}

export interface CodexLifecycleOptions {
  command: CodexCommand;
  isolatedHome: string;
  allowedQaRoot: string;
  marketplaceRoot: string;
  pluginPackageRoot: string;
  marketplaceName: string;
  pluginName: string;
}

export interface CodexCommandResult {
  args: string[];
  stdout: string;
  stderr: string;
}

export interface CodexSelfcheckResult {
  cliVersion: string;
  marketplacePresent: boolean;
  pluginInstalled: boolean;
  installedPluginRoot: string;
  majorLoopExplicitOnly: boolean;
  hooksPresent: boolean;
}

function assertInside(child: string, parent: string): void {
  const childPath = resolve(child);
  const parentPath = resolve(parent);
  const local = relative(parentPath, childPath);
  if (!local || local.startsWith("..") || isAbsolute(local)) {
    throw new Error(`Codex isolated home must be a child of ${parentPath}`);
  }
}

function run(options: CodexLifecycleOptions, args: string[]): CodexCommandResult {
  assertInside(options.isolatedHome, options.allowedQaRoot);
  const allArgs = [...options.command.prefixArgs, ...args];
  const result = spawnSync(options.command.executable, allArgs, {
    cwd: options.marketplaceRoot,
    env: { ...process.env, CODEX_HOME: resolve(options.isolatedHome) },
    encoding: "utf8",
    timeout: 30_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Codex command failed (${result.status ?? "no status"}): ${args.join(" ")}\n${result.stderr}`);
  }
  return { args, stdout: result.stdout, stderr: result.stderr };
}

function walkForManifest(root: string, pluginName: string): string | null {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const target = join(root, entry.name);
    if (entry.isDirectory()) {
      const found = walkForManifest(target, pluginName);
      if (found) return found;
    } else if (entry.name === "plugin.json" && target.includes(`${join(".codex-plugin", "plugin.json")}`)) {
      const manifest = JSON.parse(readFileSync(target, "utf8")) as { name?: string };
      if (manifest.name === pluginName) return resolve(target, "..", "..");
    }
  }
  return null;
}

function containsIdentity(raw: string, identity: string): boolean {
  return raw.toLowerCase().includes(identity.toLowerCase());
}

export function installCodexPlugin(options: CodexLifecycleOptions): CodexCommandResult[] {
  assertInside(options.isolatedHome, options.allowedQaRoot);
  mkdirSync(resolve(options.isolatedHome), { recursive: true });
  prepareCodexPluginPackage(options.marketplaceRoot, options.pluginPackageRoot);
  const results: CodexCommandResult[] = [];
  const listed = run(options, ["plugin", "marketplace", "list", "--json"]);
  if (!containsIdentity(listed.stdout, options.marketplaceName)) {
    results.push(run(options, ["plugin", "marketplace", "add", resolve(options.marketplaceRoot), "--json"]));
  }
  const plugin = run(options, ["plugin", "add", `${options.pluginName}@${options.marketplaceName}`, "--json"]);
  results.push(plugin);
  return results;
}

export function prepareCodexPluginPackage(repositoryRoot: string, packageRoot: string): void {
  const root = resolve(repositoryRoot);
  const output = resolve(packageRoot);
  const local = relative(root, output);
  if (!local || local.startsWith("..") || isAbsolute(local)) {
    throw new Error("Codex package root must be a child of the repository root.");
  }
  const files = [
    [join(root, "dist", "src", "guard", "guard.js"), join(output, "dist", "src", "guard", "guard.js")],
    [join(root, "dist", "src", "hosts", "codex", "adapter.js"), join(output, "dist", "src", "hosts", "codex", "adapter.js")]
  ] as const;
  for (const [source, target] of files) {
    if (!existsSync(source)) throw new Error(`Codex package input is missing: ${source}`);
    mkdirSync(resolve(target, ".."), { recursive: true });
    copyFileSync(source, target);
  }
}

export function selfcheckCodexPlugin(options: CodexLifecycleOptions): CodexSelfcheckResult {
  const version = run(options, ["--version"]).stdout.trim();
  const marketplaces = run(options, ["plugin", "marketplace", "list", "--json"]).stdout;
  const plugins = run(options, ["plugin", "list", "--json"]).stdout;
  const installedRoot = walkForManifest(join(resolve(options.isolatedHome), "plugins"), options.pluginName);
  if (!installedRoot) throw new Error("Installed Codex plugin manifest was not found in the isolated profile.");
  const skillPolicyPath = join(installedRoot, "skills", "major-loop-runner", "agents", "openai.yaml");
  const hookPath = join(installedRoot, "hooks", "codex-hooks.json");
  const result: CodexSelfcheckResult = {
    cliVersion: version,
    marketplacePresent: containsIdentity(marketplaces, options.marketplaceName),
    pluginInstalled: containsIdentity(plugins, options.pluginName),
    installedPluginRoot: installedRoot,
    majorLoopExplicitOnly: existsSync(skillPolicyPath) && /allow_implicit_invocation:\s*false/.test(readFileSync(skillPolicyPath, "utf8")),
    hooksPresent: existsSync(hookPath)
  };
  if (version !== `codex-cli ${CODEX_CLI_VERSION}`) throw new Error(`Unsupported Codex CLI: ${version}`);
  if (!result.marketplacePresent || !result.pluginInstalled || !result.majorLoopExplicitOnly || !result.hooksPresent) {
    throw new Error(`Codex selfcheck failed: ${JSON.stringify(result)}`);
  }
  return result;
}

export function uninstallCodexPlugin(options: CodexLifecycleOptions): CodexCommandResult[] {
  const plugin = run(options, ["plugin", "remove", `${options.pluginName}@${options.marketplaceName}`, "--json"]);
  const marketplace = run(options, ["plugin", "marketplace", "remove", options.marketplaceName, "--json"]);
  const remainingPlugins = run(options, ["plugin", "list", "--json"]).stdout;
  const remainingMarketplaces = run(options, ["plugin", "marketplace", "list", "--json"]).stdout;
  if (containsIdentity(remainingPlugins, options.pluginName) || containsIdentity(remainingMarketplaces, options.marketplaceName)) {
    throw new Error("Codex uninstall left the plugin or marketplace active in the isolated profile.");
  }
  return [plugin, marketplace];
}
// SPDX-License-Identifier: MPL-2.0
