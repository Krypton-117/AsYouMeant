// SPDX-License-Identifier: MPL-2.0

export interface SkillComparison {
  skillId: string;
  difference: string;
  mergeCandidate: boolean;
}
export interface SkillEvaluation {
  skillId: string;
  used: boolean;
  evidence: string[];
  taskTypes: string[];
  impact: string[];
  fits: string[];
  misfits: string[];
  improvements: string[];
  comparisons: SkillComparison[];
}

export interface SkillExperienceRecord {
  skillId: string;
  evidence: string[];
  taskTypes: string[];
  impact: string[];
  fits: string[];
  misfits: string[];
  improvements: string[];
  comparisons: SkillComparison[];
}

export interface SkillExperienceDocument {
  version: 1;
  authority: "advisory-only";
  skills: SkillExperienceRecord[];
}

export interface SkillExperienceUpdate {
  changed: boolean;
  document: SkillExperienceDocument;
}

export interface PostLoopInput {
  productStatus: "CLOSED";
  closedConsumerIds: string[];
  evaluations: SkillEvaluation[];
  carriedCuratorEvaluation?: SkillEvaluation;
  currentCuratorEvaluation?: SkillEvaluation;
}

export interface PostLoopOutcome {
  status: "NO_EVIDENCE" | "UNCHANGED" | "UPDATED";
  document: SkillExperienceDocument;
  exitedSkillIds: string[];
  deferredCuratorEvaluation: SkillEvaluation | null;
}
