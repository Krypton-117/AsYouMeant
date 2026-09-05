export type SupportedHost = "codex" | "claude-code" | "opencode";

export interface HostConformanceEvidence {
  host: SupportedHost;
  component: "C7" | "C8" | "C9";
  status: "CLOSED";
  productVersion: string;
  coreIdentity: string;
  validation: "real-isolated" | "official-contract";
  preStart: "deny";
  legalChain: "allow";
  artifactPresent: boolean;
}

export interface DshConformanceEvidence {
  host: "dsh";
  component: "C10";
  status: "CLOSED";
  outcome: "VERIFIED_COMPATIBLE" | "VERIFIED_INCOMPATIBLE";
  productVersion: string;
  coreIdentity: string;
  hostVersion: "0.1.1-rc.2";
  validation: "real-isolated";
  profileBundleLoaded: boolean;
  preStart: "deny";
  legalChain: "allow";
  selfcheck: "passed";
  dailyConfigChanged: false;
  cleanup: "passed";
  artifactPresent: boolean;
  reason?: string;
}

export interface ConformanceResult {
  status: "PASS";
  reusedComponents: Array<"C7" | "C8" | "C9" | "C10">;
  experimentalDshOutcome: DshConformanceEvidence["outcome"];
  checks: string[];
}

export class ConformanceError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    const ordered = [...new Set(issues)].sort();
    super(`Conformance failed:\n${ordered.map((issue) => `- ${issue}`).join("\n")}`);
    this.name = "ConformanceError";
    this.issues = ordered;
  }
}

export function runConformance(
  evidenceInput: readonly HostConformanceEvidence[],
  dshInput: Readonly<DshConformanceEvidence>,
  expectedProductVersion: string
): ConformanceResult {
  const evidence = structuredClone(evidenceInput);
  const dsh = structuredClone(dshInput);
  const issues: string[] = [];
  const expected = new Map<SupportedHost, { component: "C7" | "C8" | "C9"; validation: HostConformanceEvidence["validation"] }>([
    ["codex", { component: "C7", validation: "real-isolated" }],
    ["claude-code", { component: "C8", validation: "official-contract" }],
    ["opencode", { component: "C9", validation: "real-isolated" }]
  ]);
  const observedHosts = new Set<SupportedHost>();
  const coreIdentities = new Set<string>();

  for (const item of evidence) {
    if (observedHosts.has(item.host)) issues.push(`duplicate host evidence: ${item.host}`);
    observedHosts.add(item.host);
    coreIdentities.add(item.coreIdentity);
    const contract = expected.get(item.host);
    if (!contract) continue;
    if (item.component !== contract.component) issues.push(`${item.host} must reuse ${contract.component}`);
    if (item.validation !== contract.validation) issues.push(`${item.host} has an inaccurate validation label`);
    if (item.productVersion !== expectedProductVersion) issues.push(`${item.host} product version differs`);
    if (!item.artifactPresent) issues.push(`${item.host} artifact is absent`);
    if (item.preStart !== "deny" || item.legalChain !== "allow") {
      issues.push(`${item.host} Guard decisions are not equivalent`);
    }
  }
  for (const host of expected.keys()) {
    if (!observedHosts.has(host)) issues.push(`missing host evidence: ${host}`);
  }

  coreIdentities.add(dsh.coreIdentity);
  if (dsh.component !== "C10" || dsh.status !== "CLOSED") issues.push("DSH evidence must close C10");
  if (dsh.productVersion !== expectedProductVersion) issues.push("DSH product version differs");
  if (dsh.hostVersion !== "0.1.1-rc.2") issues.push("DSH host version is outside the experimental contract");
  if (dsh.validation !== "real-isolated") issues.push("DSH validation label is inaccurate");
  if (!dsh.artifactPresent || !dsh.profileBundleLoaded) issues.push("DSH artifact or Profile Bundle is absent");
  if (dsh.dailyConfigChanged || dsh.cleanup !== "passed") issues.push("DSH isolation or cleanup contract failed");
  if (dsh.outcome === "VERIFIED_COMPATIBLE") {
    if (dsh.preStart !== "deny" || dsh.legalChain !== "allow" || dsh.selfcheck !== "passed") {
      issues.push("DSH compatible claim lacks the required Guard chain");
    }
  } else if (!dsh.reason) {
    issues.push("DSH incompatible claim requires a concrete reason");
  }

  if (coreIdentities.size !== 1) issues.push("host artifacts do not share one core compatibility identity");
  if (issues.length > 0) throw new ConformanceError(issues);

  const reusedComponents: ConformanceResult["reusedComponents"] = [
    ...evidence.map((item) => item.component),
    "C10"
  ];
  reusedComponents.sort();

  return {
    status: "PASS",
    reusedComponents,
    experimentalDshOutcome: dsh.outcome,
    checks: [
      "official-three-host-set",
      "product-version",
      "core-identity",
      "validation-labels",
      "guard-equivalence",
      "artifact-presence",
      "experimental-dsh",
      "isolation-cleanup"
    ]
  };
}
// SPDX-License-Identifier: MPL-2.0
