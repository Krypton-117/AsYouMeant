import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ConformanceError,
  runConformance,
  type HostConformanceEvidence
} from "../src/index.js";

const packageVersion = (path: string): string =>
  (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version;

const evidence = (): HostConformanceEvidence[] => [
  {
    host: "codex",
    component: "C7",
    status: "CLOSED",
    productVersion: packageVersion("native/codex/.codex-plugin/plugin.json"),
    coreIdentity: "asyoumeant-core-0.1.0",
    validation: "real-isolated",
    preStart: "deny",
    legalChain: "allow",
    artifactPresent: existsSync("native/codex/.codex-plugin/plugin.json")
  },
  {
    host: "claude-code",
    component: "C8",
    status: "CLOSED",
    productVersion: packageVersion("native/claude/.claude-plugin/plugin.json"),
    coreIdentity: "asyoumeant-core-0.1.0",
    validation: "official-contract",
    preStart: "deny",
    legalChain: "allow",
    artifactPresent: existsSync("native/claude/.claude-plugin/plugin.json")
  },
  {
    host: "opencode",
    component: "C9",
    status: "CLOSED",
    productVersion: packageVersion("native/opencode/package.json"),
    coreIdentity: "asyoumeant-core-0.1.0",
    validation: "real-isolated",
    preStart: "deny",
    legalChain: "allow",
    artifactPresent: existsSync("native/opencode/package.json")
  }
];

test("C12 reuses C7-C9 evidence and checks only untested assembly contracts", () => {
  const result = runConformance(evidence(), "0.1.0");
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reusedComponents, ["C7", "C8", "C9"]);
  assert.deepEqual(result.checks, [
    "three-host-set",
    "product-version",
    "core-identity",
    "validation-labels",
    "guard-equivalence",
    "artifact-presence"
  ]);
});

test("C12 rejects an inaccurate real-host claim", () => {
  const invalid = evidence();
  const claude = invalid.find((item) => item.host === "claude-code");
  if (claude) claude.validation = "real-isolated";
  assert.throws(() => runConformance(invalid, "0.1.0"), ConformanceError);
});
