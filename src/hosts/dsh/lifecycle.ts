// SPDX-License-Identifier: MPL-2.0

import { existsSync, readFileSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const DSH_VERSION = "0.1.1-rc.2";
export const DSH_PACKAGE_NAME = "asyoumeant-dsh";
export const DSH_PROFILE_NAME = "headless";
export const DSH_SKILL_NAME = "asyoumeant-major-loop-runner";
export const DSH_START_SOURCE = "dsh-skill-invocation";
export const DSH_SELFCHECK_TOOL = "asyoumeant_selfcheck";

export interface DshLifecycleOptions {
  dshBin: string;
  repositoryRoot: string;
  packageRoot: string;
  dshHome: string;
  allowedQaRoot: string;
  contractPath: string;
  profileName?: string;
}

export interface DshProcessResult {
  stdout: string;
  stderr: string;
}

export interface DshPackageContract {
  name: string;
  version: string;
  license: string;
  patch: string;
}

export class DshLifecycleError extends Error {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(message: string, status: number | null, stdout: string, stderr: string) {
    super(message);
    this.name = "DshLifecycleError";
    this.status = status;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}

function assertExactChild(path: string, root: string): string {
  const resolvedPath = resolve(path);
  const resolvedRoot = resolve(root);
  const offset = relative(resolvedRoot, resolvedPath);
  if (offset.length === 0 || offset.startsWith("..") || resolve(resolvedRoot, offset) !== resolvedPath) {
    throw new DshLifecycleError(`Unsafe DSH isolation path: ${resolvedPath}`, null, "", "");
  }
  return resolvedPath;
}

function runDsh(options: DshLifecycleOptions, args: string[]): DshProcessResult {
  if (!existsSync(options.dshBin)) {
    throw new DshLifecycleError(`DSH executable is absent: ${options.dshBin}`, null, "", "");
  }
  const result = spawnSync(process.execPath, [options.dshBin, ...args], {
    cwd: options.repositoryRoot,
    env: dshChildEnvironment(options),
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (result.error || result.status !== 0) {
    throw new DshLifecycleError(
      result.error?.message ?? `DSH exited with status ${result.status ?? "unknown"}`,
      result.status,
      stdout,
      stderr
    );
  }
  return { stdout, stderr };
}

export function dshChildEnvironment(
  options: Pick<DshLifecycleOptions, "dshHome" | "contractPath">,
  parent: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of [
    "Path",
    "PATH",
    "SystemRoot",
    "ComSpec",
    "PATHEXT",
    "TEMP",
    "TMP",
    "LOCALAPPDATA",
    "APPDATA",
    "USERPROFILE"
  ]) {
    if (parent[key] !== undefined) environment[key] = parent[key];
  }
  environment.DSH_HOME = options.dshHome;
  environment.DSH_PERMISSION_MODE = "read-only";
  environment.ASYOUMEANT_CONTRACT_PATH = options.contractPath;
  environment.npm_config_store_dir = resolve(options.dshHome, ".pnpm-store");
  return environment;
}

export function readDshPackageContract(packageRoot: string): DshPackageContract {
  const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
    name?: string;
    version?: string;
    license?: string;
    dsh?: { bundle?: { patch?: string } };
  };
  return {
    name: manifest.name ?? "",
    version: manifest.version ?? "",
    license: manifest.license ?? "",
    patch: manifest.dsh?.bundle?.patch ?? ""
  };
}

export function installDshPlugin(options: DshLifecycleOptions): DshProcessResult {
  const profile = options.profileName ?? DSH_PROFILE_NAME;
  return runDsh(options, ["plugin", "--profile", profile, "add", options.packageRoot]);
}

export function inspectDshPlugin(options: DshLifecycleOptions): DshProcessResult {
  const profile = options.profileName ?? DSH_PROFILE_NAME;
  const result = runDsh(options, ["--profile", profile, "--dump-config"]);
  if (!result.stdout.includes("asyoumeant-dsh")) {
    throw new DshLifecycleError("DSH composed config omitted the AsYouMeant bundle.", 1, result.stdout, result.stderr);
  }
  return result;
}

export function runDshHeadlessTask(options: DshLifecycleOptions, task: string): DshProcessResult {
  const profile = options.profileName ?? DSH_PROFILE_NAME;
  return runDsh(options, ["--profile", profile, task]);
}

export function uninstallDshPlugin(options: DshLifecycleOptions): DshProcessResult {
  const profile = options.profileName ?? DSH_PROFILE_NAME;
  return runDsh(options, ["plugin", "--profile", profile, "remove", DSH_PACKAGE_NAME]);
}

export function cleanupDshIsolation(options: DshLifecycleOptions): void {
  const target = assertExactChild(options.dshHome, options.allowedQaRoot);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
