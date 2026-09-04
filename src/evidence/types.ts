export type HighTrustSourceKind =
  | "official-documentation"
  | "official-source"
  | "official-registry"
  | "standard"
  | "peer-reviewed-paper";

export interface EvidenceSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  kind: HighTrustSourceKind;
  primary: boolean;
  claim: string;
  limitations: string[];
  retrievedAt: string;
}

export type DecisionImpact =
  | { kind: "technical-fact"; decisionId: string }
  | { kind: "approved-research"; decisionId: string }
  | { kind: "optional-improvement"; decisionId: string; improvementId: string };

export interface DirectUserPermission {
  sourceKind: "direct-user";
  source: string;
  improvementId: string;
}

export interface EvidenceQuestion {
  id: string;
  question: string;
  consumerIds: string[];
  acceptedSourceKinds: HighTrustSourceKind[];
  decisionImpact: DecisionImpact;
  directPermission?: DirectUserPermission;
  sources: EvidenceSource[];
}

export interface EvidenceCatalog {
  consumerIds: string[];
  questions: EvidenceQuestion[];
}

export type EvidenceDisposition =
  | "evidence-only"
  | "proposal-only"
  | "implementation-authorized";

export interface EvidenceReport {
  questionId: string;
  question: string;
  consumerIds: string[];
  decisionImpact: DecisionImpact;
  findings: Array<{
    sourceId: string;
    claim: string;
    limitations: string[];
  }>;
  sources: EvidenceSource[];
  disposition: EvidenceDisposition;
  executionProjectionChange: null | {
    kind: "authorize-optional-improvement";
    improvementId: string;
    permissionSource: string;
  };
}
