import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const nodeFlag = process.argv.indexOf("--node");
const nodeId = nodeFlag >= 0 ? process.argv[nodeFlag + 1] : undefined;

if (nodeFlag < 0 || !/^C(?:[1-9]|1[0-9]|2[01])$/.test(nodeId ?? "")) {
  console.error("Usage: pnpm verify --node C<n>, where n is an active Component id.");
  process.exit(2);
}

const suites = {
  C1: "dist/test/c1-contract-compiler.test.js",
  C2: "dist/test/c2-evidence-resolver.test.js",
  C3: "dist/test/c3-state-ledger.test.js",
  C4: "dist/test/c4-guard.test.js",
  C5: "dist/test/c5-major-loop-runner.test.js",
  C6: "dist/test/c6-diagnostic-kernel.test.js",
  C7: "dist/test/c7-codex-native-delivery.test.js",
  C8: "dist/test/c8-claude-native-delivery.test.js",
  C9: "dist/test/c9-opencode-native-delivery.test.js",
  C10: "dist/test/c10-dsh-experimental-probe.test.js",
  C11: "dist/test/c11-independent-gate-reviewer.test.js",
  C12: "dist/test/c12-conformance-runner.test.js",
  C13: "dist/test/c13-acceptance-presenter.test.js",
  C14: "test/c14-license-compliance.test.mjs",
  C15: "test/c15-bilingual-readme.test.mjs",
  C16: "dist/test/c16-skill-pool.test.js",
  C17: "dist/test/c17-task-local-skill.test.js",
  C20: "dist/test/c20-skill-experience-store.test.js",
  C21: "dist/test/c21-post-loop-curator.test.js"
};
const suite = suites[nodeId];

if (!suite) {
  console.error(`No acceptance suite is implemented for ${nodeId}.`);
  process.exit(2);
}

const require = createRequire(import.meta.url);
const typescriptPackagePath = require.resolve("typescript/package.json");
const typescriptPackage = JSON.parse(readFileSync(typescriptPackagePath, "utf8"));
const tsc = resolve(dirname(typescriptPackagePath), typescriptPackage.bin.tsc);
const build = spawnSync(process.execPath, [tsc, "-p", "tsconfig.json"], {
  stdio: "inherit"
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

if (!existsSync(suite)) {
  console.error(`Acceptance suite was not built: ${suite}`);
  process.exit(2);
}

if (nodeId === "C12") {
  const pnpmEntry = process.env.npm_execpath;
  if (!pnpmEntry) {
    console.error("C12 requires pnpm to provide npm_execpath.");
    process.exit(2);
  }
  const conformance = spawnSync(process.execPath, [pnpmEntry, "run", "conformance"], {
    stdio: "inherit"
  });
  process.exit(conformance.status ?? 1);
}

const test = spawnSync(process.execPath, ["--test", suite], {
  stdio: "inherit"
});
process.exit(test.status ?? 1);
// SPDX-License-Identifier: MPL-2.0
