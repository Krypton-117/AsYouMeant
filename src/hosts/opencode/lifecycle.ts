import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync
} from "node:fs";
import { createServer } from "node:net";
import { isAbsolute, join, relative, resolve } from "node:path";

import { OPENCODE_COMMAND_NAME, OPENCODE_VERSION } from "./adapter.js";

export interface OpenCodeLifecycleOptions {
  executable: string;
  repositoryRoot: string;
  packageRoot: string;
  workspaceRoot: string;
  isolatedRoot: string;
  allowedQaRoot: string;
}

export interface OpenCodeSelfcheckResult {
  cliVersion: string;
  pluginInstalled: boolean;
  skillsInstalled: boolean;
  commandRegistered: boolean;
  nativePluginLoaded: boolean;
  installedPluginPath: string;
}

function requireChild(child: string, parent: string, label: string): void {
  const local = relative(resolve(parent), resolve(child));
  if (!local || local.startsWith("..") || isAbsolute(local)) {
    throw new Error(`${label} must be a child of ${resolve(parent)}.`);
  }
}

function locations(options: OpenCodeLifecycleOptions) {
  const configRoot = join(options.workspaceRoot, ".opencode");
  return {
    configRoot,
    pluginPath: join(configRoot, "plugins", "asyoumeant.js"),
    runtimeRoot: join(configRoot, "asyoumeant-runtime"),
    skillRoot: join(configRoot, "skills"),
    profileConfig: join(options.isolatedRoot, "profile", "config"),
    profileData: join(options.isolatedRoot, "profile", "data"),
    profileCache: join(options.isolatedRoot, "profile", "cache"),
    profileState: join(options.isolatedRoot, "profile", "state"),
    runtimeEvidence: join(options.isolatedRoot, "runtime", "plugin-loaded.json")
  };
}

function isolatedEnvironment(options: OpenCodeLifecycleOptions): NodeJS.ProcessEnv {
  const place = locations(options);
  for (const path of [place.profileConfig, place.profileData, place.profileCache, place.profileState]) {
    mkdirSync(path, { recursive: true });
  }
  return {
    ...process.env,
    XDG_CONFIG_HOME: place.profileConfig,
    XDG_DATA_HOME: place.profileData,
    XDG_CACHE_HOME: place.profileCache,
    XDG_STATE_HOME: place.profileState,
    OPENCODE_CONFIG_DIR: place.profileConfig,
    OPENCODE_DISABLE_DEFAULT_PLUGINS: "1",
    ASYOUMEANT_CONTRACT_PATH: join(options.workspaceRoot, ".asyoumeant", "contract.json"),
    ASYOUMEANT_STATE_DIR: join(options.isolatedRoot, "runtime")
  };
}

export function prepareOpenCodePluginPackage(repositoryRoot: string, packageRoot: string): void {
  requireChild(packageRoot, repositoryRoot, "OpenCode package root");
  const files = [
    [join(repositoryRoot, "dist", "src", "guard", "guard.js"), join(packageRoot, "dist", "src", "guard", "guard.js")],
    [join(repositoryRoot, "dist", "src", "skills", "pool.js"), join(packageRoot, "dist", "src", "skills", "pool.js")],
    [join(repositoryRoot, "dist", "src", "hosts", "skill-pool.js"), join(packageRoot, "dist", "src", "hosts", "skill-pool.js")],
    [join(repositoryRoot, "dist", "src", "hosts", "opencode", "adapter.js"), join(packageRoot, "dist", "src", "hosts", "opencode", "adapter.js")]
  ] as const;
  for (const [source, target] of files) {
    if (!existsSync(source)) throw new Error(`OpenCode package input is missing: ${source}`);
    mkdirSync(resolve(target, ".."), { recursive: true });
    copyFileSync(source, target);
  }
}

export function installOpenCodePlugin(options: OpenCodeLifecycleOptions): string {
  requireChild(options.workspaceRoot, options.allowedQaRoot, "OpenCode workspace");
  requireChild(options.isolatedRoot, options.allowedQaRoot, "OpenCode isolated root");
  prepareOpenCodePluginPackage(options.repositoryRoot, options.packageRoot);
  const place = locations(options);
  mkdirSync(resolve(place.pluginPath, ".."), { recursive: true });
  mkdirSync(place.runtimeRoot, { recursive: true });
  copyFileSync(join(options.packageRoot, "asyoumeant.js"), place.pluginPath);
  cpSync(join(options.packageRoot, "dist"), join(place.runtimeRoot, "dist"), { recursive: true, force: true });
  cpSync(join(options.packageRoot, "skills"), place.skillRoot, { recursive: true, force: true });
  return place.pluginPath;
}

function cliVersion(options: OpenCodeLifecycleOptions): string {
  const result = spawnSync(options.executable, ["--version"], {
    cwd: options.workspaceRoot,
    env: isolatedEnvironment(options),
    encoding: "utf8",
    timeout: 15_000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`OpenCode version check failed: ${result.stderr}`);
  return result.stdout.trim();
}

async function availablePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("OpenCode test port allocation failed."));
        return;
      }
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

function commandArray(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as Array<Record<string, unknown>>;
  }
  return [];
}

async function hostRegistersCommand(options: OpenCodeLifecycleOptions): Promise<boolean> {
  const port = await availablePort();
  const child = spawn(options.executable, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: options.workspaceRoot,
    env: isolatedEnvironment(options),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
  const location = `directory=${encodeURIComponent(options.workspaceRoot)}`;
  const commandUrl = `http://127.0.0.1:${port}/command?${location}`;
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`OpenCode server exited early (${child.exitCode}).`);
      try {
        const response = await fetch(commandUrl);
        if (!response.ok) continue;
        const commands = commandArray(await response.json());
        if (commands.some((command) => command.name === OPENCODE_COMMAND_NAME)) return true;
      } catch {
        // Startup is observable through the bounded endpoint poll.
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
    const details = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n").slice(-4000);
    throw new Error(`OpenCode command registration timed out.${details ? ` Host output: ${details}` : ""}`);
  } finally {
    child.kill();
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
  }
}

export async function selfcheckOpenCodePlugin(options: OpenCodeLifecycleOptions): Promise<OpenCodeSelfcheckResult> {
  const place = locations(options);
  const version = cliVersion(options);
  const commandRegistered = await hostRegistersCommand(options);
  const skillNames = ["pre-loop-governor", "evidence-research", "major-loop-runner", "diagnostic-kernel", "post-loop-curator"];
  const result: OpenCodeSelfcheckResult = {
    cliVersion: version,
    pluginInstalled: existsSync(place.pluginPath) && existsSync(join(place.runtimeRoot, "dist", "src", "hosts", "opencode", "adapter.js")),
    skillsInstalled: skillNames.every((name) => existsSync(join(place.skillRoot, name, "SKILL.md"))),
    commandRegistered,
    nativePluginLoaded: existsSync(place.runtimeEvidence),
    installedPluginPath: place.pluginPath
  };
  if (version !== OPENCODE_VERSION) throw new Error(`Unsupported OpenCode CLI: ${version}`);
  if (!result.pluginInstalled || !result.skillsInstalled || !result.commandRegistered || !result.nativePluginLoaded) {
    throw new Error(`OpenCode selfcheck failed: ${JSON.stringify(result)}`);
  }
  return result;
}

export function uninstallOpenCodePlugin(options: OpenCodeLifecycleOptions): void {
  requireChild(options.workspaceRoot, options.allowedQaRoot, "OpenCode workspace");
  const place = locations(options);
  const targets = [
    place.pluginPath,
    place.runtimeRoot,
    ...["pre-loop-governor", "evidence-research", "major-loop-runner", "diagnostic-kernel", "post-loop-curator"]
      .map((name) => join(place.skillRoot, name))
  ];
  for (const target of targets) {
    requireChild(target, options.workspaceRoot, "OpenCode uninstall target");
    rmSync(target, { recursive: true, force: true });
  }
  if (existsSync(place.pluginPath) || existsSync(place.runtimeRoot)) {
    throw new Error("OpenCode uninstall left AsYouMeant runtime files in the isolated project.");
  }
}

export function readOpenCodeContractEvidence(packageRoot: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(packageRoot, "CONTRACT-EVIDENCE.json"), "utf8")) as Record<string, unknown>;
}
// SPDX-License-Identifier: MPL-2.0
