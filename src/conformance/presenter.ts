export interface AcceptancePresentationInput {
  nodeId: string;
  title: string;
  result: "passed" | "failed";
  evidence: string[];
  shortestSteps: string[];
  expectedResult: string;
  failureMeaning: string;
  evidenceLocation: string;
  executor: string;
  acceptor: string;
  nextStep: string;
  limitation?: string;
}

export interface AcceptancePackage extends AcceptancePresentationInput {
  summary: string;
}

export function presentAcceptance(input: Readonly<AcceptancePresentationInput>): AcceptancePackage {
  if (input.evidence.length === 0) throw new Error("Acceptance evidence is required.");
  if (input.shortestSteps.length === 0) throw new Error("At least one user step is required.");
  const requiredText = {
    nodeId: input.nodeId,
    title: input.title,
    expectedResult: input.expectedResult,
    failureMeaning: input.failureMeaning,
    evidenceLocation: input.evidenceLocation,
    executor: input.executor,
    acceptor: input.acceptor,
    nextStep: input.nextStep
  };
  const blankField = Object.entries(requiredText).find(([, value]) => value.trim().length === 0)?.[0];
  if (blankField) throw new Error(`Acceptance field ${blankField} must be non-empty.`);
  if (input.evidence.some((item) => item.trim().length === 0)) {
    throw new Error("Acceptance evidence entries must be non-empty.");
  }
  if (input.shortestSteps.some((item) => item.trim().length === 0)) {
    throw new Error("Acceptance user steps must be non-empty.");
  }
  return {
    ...structuredClone(input),
    summary: input.result === "passed"
      ? `${input.title} 已通过，可以按最短步骤确认。`
      : `${input.title} 未通过，请先处理失败原因。`
  };
}
// SPDX-License-Identifier: MPL-2.0
