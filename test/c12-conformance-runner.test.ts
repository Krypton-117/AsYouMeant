import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  ConformanceError,
  runConformance,
  type DshConformanceEvidence,
  type HostConformanceEvidence
} from "../src/index.js";

const productVersion = "0.3.0";
const coreIdentity = "asyoumeant-core-0.3.0";
const packageVersion = (path: string): string =>
  (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version;

const evidence = (): HostConformanceEvidence[] => [
  {
    host: "codex",
    component: "C7",
    status: "CLOSED",
    productVersion: packageVersion("native/codex/.codex-plugin/plugin.json"),
    coreIdentity,
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
    coreIdentity,
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
    coreIdentity,
    validation: "real-isolated",
    preStart: "deny",
    legalChain: "allow",
    artifactPresent: existsSync("native/opencode/package.json")
  }
];

const dshEvidence = (): DshConformanceEvidence => ({
  ...(JSON.parse(readFileSync("native/dsh/CONTRACT-EVIDENCE.json", "utf8")) as DshConformanceEvidence),
  coreIdentity,
  artifactPresent: existsSync("native/dsh/package.json")
});

test("C12 reuses C7-C10 evidence and checks only changed assembly contracts", () => {
  const result = runConformance(evidence(), dshEvidence(), productVersion);
  assert.equal(result.status, "PASS");
  assert.deepEqual(result.reusedComponents, ["C10", "C7", "C8", "C9"]);
  assert.equal(result.experimentalDshOutcome, "VERIFIED_COMPATIBLE");
  assert.deepEqual(result.checks, [
    "official-three-host-set",
    "product-version",
    "core-identity",
    "validation-labels",
    "guard-equivalence",
    "artifact-presence",
    "experimental-dsh",
    "isolation-cleanup"
  ]);
});

test("C12 rejects inaccurate official and experimental host claims", () => {
  const invalidOfficial = evidence();
  const claude = invalidOfficial.find((item) => item.host === "claude-code");
  if (claude) claude.validation = "real-isolated";
  assert.throws(() => runConformance(invalidOfficial, dshEvidence(), productVersion), ConformanceError);

  const invalidDsh = dshEvidence();
  Object.assign(invalidDsh, { hostVersion: "0.1.1-rc.3" });
  assert.throws(() => runConformance(evidence(), invalidDsh, productVersion), ConformanceError);
});
// SPDX-License-Identifier: MPL-2.0
