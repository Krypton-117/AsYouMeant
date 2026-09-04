import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const nodeFlag = process.argv.indexOf("--node");
const nodeId = nodeFlag >= 0 ? process.argv[nodeFlag + 1] : undefined;

if (nodeFlag < 0 || !/^C(?:[1-9]|1[0-3])$/.test(nodeId ?? "")) {
  console.error("Usage: pnpm verify --node C<n>, where n is 1 through 13.");
  process.exit(2);
}

const suites = {
  C1: "dist/test/c1-contract-compiler.test.js",
  C2: "dist/test/c2-evidence-resolver.test.js"
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

const test = spawnSync(process.execPath, ["--test", suite], {
  stdio: "inherit"
});
process.exit(test.status ?? 1);
