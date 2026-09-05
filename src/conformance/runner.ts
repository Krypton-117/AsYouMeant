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

export interface ConformanceResult {
  status: "PASS";
  reusedComponents: Array<"C7" | "C8" | "C9">;
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
  expectedProductVersion: string
): ConformanceResult {
  const evidence = structuredClone(evidenceInput);
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
  if (coreIdentities.size !== 1) issues.push("host artifacts do not share one core compatibility identity");
  if (issues.length > 0) throw new ConformanceError(issues);

  return {
    status: "PASS",
    reusedComponents: evidence.map((item) => item.component).sort(),
    checks: [
      "three-host-set",
      "product-version",
      "core-identity",
      "validation-labels",
      "guard-equivalence",
      "artifact-presence"
    ]
  };
}
