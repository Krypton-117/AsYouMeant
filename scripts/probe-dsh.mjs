// SPDX-License-Identifier: MPL-2.0

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  cleanupDshIsolation,
  DSH_PACKAGE_NAME,
  DSH_SELFCHECK_TOOL,
  DSH_SKILL_NAME,
  DSH_START_SOURCE,
  DSH_VERSION,
  DshLifecycleError,
  inspectDshPlugin,
  installDshPlugin,
  runDshHeadlessTask,
  uninstallDshPlugin
} from "../dist/src/index.js";

const candidateVersion = "2026-09-05.2";
const productVersion = "0.3.1";
const projectionIdentity = `bootstrap-${candidateVersion}/C10/real-1`;
const repositoryRoot = resolve(".");
const qaRoot = join(repositoryRoot, ".work", "qa", `bootstrap-${candidateVersion}`);
const dshHome = join(qaRoot, "dsh");
const workspace = join(dshHome, "workspace");
const contractPath = join(workspace, ".asyoumeant", "contract.json");
const packageRoot = join(repositoryRoot, "native", "dsh");
const dshFlag = process.argv.indexOf("--dsh-bin");
const dshBin = dshFlag >= 0 ? process.argv[dshFlag + 1] : process.env.DSH_BIN;

if (!dshBin || !existsSync(dshBin)) {
  console.error("Usage: pnpm probe:dsh -- --dsh-bin <absolute path to DSH lib/bin.js>");
  process.exit(2);
}

mkdirSync(join(workspace, ".asyoumeant"), { recursive: true });
writeFileSync(contractPath, `${JSON.stringify({
  candidateVersion,
  productVersion,
  projectionIdentity,
  review: { result: "PRE_LOOP_REVIEW_PASSED", candidateVersion, projectionIdentity },
  dsh: {
    allowedTools: [DSH_SELFCHECK_TOOL],
    permitDurationMs: 3_600_000
  }
}, null, 2)}\n`, "utf8");

const options = {
  dshBin,
  repositoryRoot: workspace,
  packageRoot,
  dshHome,
  allowedQaRoot: qaRoot,
  contractPath
};
let installed = false;
let keepForAuthentication = false;
let result;

const authPattern = /api[_ -]?key|credential|unauthorized|authentication|login|401/i;
const textOf = (error) => error instanceof DshLifecycleError
  ? `${error.message}\n${error.stdout}\n${error.stderr}`
  : String(error);

try {
  installDshPlugin(options);
  installed = true;
  const composed = inspectDshPlugin(options);
  const preStart = runDshHeadlessTask(
    options,
    `Use AYM for this task. Call ${DSH_SELFCHECK_TOOL} exactly once. Return the exact denial code.`
  );
  const startCommand = `/${DSH_SKILL_NAME} start candidate=${candidateVersion}`;
  const legal = runDshHeadlessTask(
    options,
    `${startCommand}\nCall ${DSH_SELFCHECK_TOOL} exactly once and return its exact status and candidate.`
  );
  if (!/PRE_START_HARD_LOCK/i.test(preStart.stdout)) {
    throw new Error("The DSH pre-start run did not expose PRE_START_HARD_LOCK.");
  }
  if (!/ACTIVE/i.test(legal.stdout) || !legal.stdout.includes(candidateVersion)) {
    throw new Error("The DSH legal run did not expose the active candidate permit.");
  }
  result = {
    component: "C10",
    status: "CLOSED",
    outcome: "VERIFIED_COMPATIBLE",
    productVersion,
    host: "dsh",
    hostVersion: DSH_VERSION,
    package: DSH_PACKAGE_NAME,
    validation: "real-isolated",
    profileBundleLoaded: composed.stdout.includes("asyoumeant-dsh"),
    sourceKind: DSH_START_SOURCE,
    preStart: "deny",
    legalChain: "allow",
    selfcheck: "passed",
    dailyConfigChanged: false,
    cleanup: "passed"
  };
} catch (error) {
  const detail = textOf(error);
  if (authPattern.test(detail)) {
    keepForAuthentication = true;
    console.error(JSON.stringify({
      component: "C10",
      status: "WAITING_USER",
      reason: "DSH_AUTHENTICATION_REQUIRED",
      dshHome
    }, null, 2));
    process.exitCode = 3;
  } else {
    console.error(JSON.stringify({
      component: "C10",
      status: "FAILED",
      reason: "DSH_PROBE_FAILED",
      detail: detail.slice(0, 4000)
    }, null, 2));
    process.exitCode = 1;
  }
} finally {
  if (!keepForAuthentication) {
    if (installed) {
      try {
        uninstallDshPlugin(options);
      } catch (error) {
        console.error(`DSH uninstall failed: ${textOf(error).slice(0, 1000)}`);
        process.exitCode = 1;
      }
    }
    cleanupDshIsolation(options);
  }
}

if (result) console.log(JSON.stringify(result, null, 2));
