// SPDX-License-Identifier: MPL-2.0
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { packDsh } from "./pack-dsh.mjs";
import { cleanupDshIsolation, DSH_VERSION, installDshPlugin, inspectDshPlugin, uninstallDshPlugin, dshChildEnvironment } from "../dist/src/hosts/dsh/lifecycle.js";

const flag = process.argv.indexOf("--dsh-bin");
const dshBin = flag >= 0 ? process.argv[flag + 1] : process.env.DSH_BIN;
const fromRegistry = process.argv.includes("--registry");
const profileFlag = process.argv.indexOf("--profile");
const profileName = profileFlag < 0 ? "headless" : process.argv[profileFlag + 1];
if (!["headless", "web"].includes(profileName)) throw new Error("--profile must be headless or web.");
if (!dshBin) throw new Error("Usage: node scripts/probe-dsh-package.mjs --dsh-bin <absolute DSH lib/bin.js>");
const qaRoot = resolve(".work", "qa");
mkdirSync(qaRoot, { recursive: true });
const dshHome = mkdtempSync(join(qaRoot, "dsh-package-"));
const options = { dshBin, repositoryRoot: resolve("."), packageRoot: "", dshHome, allowedQaRoot: qaRoot, contractPath: join(dshHome, "absent-contract.json"), profileName, commandTimeoutMs: 60000 };
let installed = false;
try {
  const version = spawnSync(process.execPath, [dshBin, "--version"], { encoding: "utf8", env: dshChildEnvironment(options), timeout: 10000 });
  if (version.status !== 0 || version.stdout.trim() !== DSH_VERSION) throw new Error(`Expected DSH ${DSH_VERSION}; host version check failed.`);
  const packed = packDsh();
  options.packageRoot = fromRegistry ? `${packed.name}@${packed.version}` : packed.path;
  installDshPlugin(options);
  installed = true;
  const profilePath = join(dshHome, "profiles", profileName, "package.json");
  const profile = JSON.parse(readFileSync(profilePath, "utf8"));
  if (!profile.dsh.profile.bundles.includes(packed.name)) throw new Error("Installed tarball was not reconciled as a DSH Profile Bundle.");
  const installedManifest = JSON.parse(readFileSync(join(dshHome, "profiles", profileName, "node_modules", packed.name, "package.json"), "utf8"));
  if (installedManifest.version !== packed.version) throw new Error("Installed package version differs from tarball.");
  for (const file of packed.files) {
    const installedFile = readFileSync(join(dshHome, "profiles", profileName, "node_modules", packed.name, file));
    const sourceFile = readFileSync(resolve("native", "dsh", file));
    if (!installedFile.equals(sourceFile)) throw new Error(`Installed package content differs from verified source: ${file}`);
  }
  inspectDshPlugin(options);
  uninstallDshPlugin(options);
  installed = false;
  const removed = JSON.parse(readFileSync(profilePath, "utf8"));
  if (removed.dependencies?.[packed.name] || removed.dsh.profile.bundles.includes(packed.name)) throw new Error("DSH did not remove the dependency and bundle layer.");
  console.log(JSON.stringify({ status: "PASS", hostVersion: DSH_VERSION, profile: profileName, package: `${packed.name}@${packed.version}`, install: fromRegistry ? "registry" : "tarball", contents: "source-equal", composition: "verified", uninstall: "verified", webUi: "not-requested", authenticatedModelRun: "not-requested", dailyProfileChanged: false }, null, 2));
} finally {
  try { if (installed) uninstallDshPlugin(options); }
  finally { cleanupDshIsolation(options); }
}
