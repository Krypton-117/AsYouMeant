import assert from "node:assert/strict";
import test from "node:test";

import {
  EvidenceResolutionError,
  EvidenceResolver,
  type EvidenceCatalog,
  type EvidenceQuestion
} from "../src/index.js";

const officialSource = () => ({
  id: "S-PNPM-BUILDS",
  title: "pnpm Build Settings",
  publisher: "pnpm",
  url: "https://pnpm.io/settings/build",
  kind: "official-documentation" as const,
  primary: true,
  claim: "allowBuilds can explicitly permit or deny dependency build scripts.",
  limitations: ["This source documents pnpm 11 and 12, not earlier releases."],
  retrievedAt: "2026-09-05"
});

const technicalQuestion = (): EvidenceQuestion => ({
  id: "Q-PNPM-BUILD-POLICY",
  question: "How should an unneeded transitive build script be handled in pnpm 11?",
  consumerIds: ["R9", "C1"],
  acceptedSourceKinds: ["official-documentation"],
  decisionImpact: { kind: "technical-fact", decisionId: "D-PNPM-BUILD-POLICY" },
  sources: [officialSource()]
});

const optionalImprovementQuestion = (): EvidenceQuestion => ({
  id: "Q-OPTIONAL-CACHE",
  question: "Would a remote cache improve this Product?",
  consumerIds: ["R9", "C7"],
  acceptedSourceKinds: ["official-documentation", "official-source"],
  decisionImpact: {
    kind: "optional-improvement",
    decisionId: "D-OPTIONAL-CACHE",
    improvementId: "remote-cache"
  },
  sources: [
    {
      ...officialSource(),
      id: "S-CACHE",
      claim: "A remote cache can reuse signed build outputs in supported configurations.",
      limitations: ["The feature is optional and does not prove a benefit for this Product."]
    }
  ]
});

const catalog = (...questions: EvidenceQuestion[]): EvidenceCatalog => ({
  consumerIds: ["R9", "C1", "C7"],
  questions
});

const expectResolutionFailure = (
  question: EvidenceQuestion,
  expected: RegExp,
  knownConsumers = ["R9", "C1", "C7"]
): void => {
  const resolver = new EvidenceResolver({ consumerIds: knownConsumers, questions: [question] });
  assert.throws(() => resolver.resolve(question.id), (error: unknown) => {
    assert.ok(error instanceof EvidenceResolutionError);
    assert.match(error.message, expected);
    return true;
  });
};

test("C2 resolves a named technical question from an appropriate primary source", () => {
  const resolver = new EvidenceResolver(catalog(technicalQuestion()));
  const first = resolver.resolve("Q-PNPM-BUILD-POLICY");
  const second = resolver.resolve("Q-PNPM-BUILD-POLICY");

  assert.deepEqual(first, second);
  assert.deepEqual(first.consumerIds, ["C1", "R9"]);
  assert.equal(first.sources[0]?.url, "https://pnpm.io/settings/build");
  assert.equal(first.disposition, "evidence-only");
  assert.equal(first.executionProjectionChange, null);
});

test("C2 rejects evidence without a named and known consumer", async (suite) => {
  await suite.test("missing consumer", () => {
    const question = technicalQuestion();
    question.consumerIds = [];
    expectResolutionFailure(question, /no named consumer/);
  });

  await suite.test("unknown consumer", () => {
    const question = technicalQuestion();
    question.consumerIds = ["C404"];
    expectResolutionFailure(question, /unknown consumer C404/);
  });
});

test("C2 rejects secondary, insecure, and question-inappropriate sources", async (suite) => {
  await suite.test("secondary source", () => {
    const question = technicalQuestion();
    const source = question.sources[0];
    if (source) source.primary = false;
    expectResolutionFailure(question, /not marked as primary/);
  });

  await suite.test("insecure source URL", () => {
    const question = technicalQuestion();
    const source = question.sources[0];
    if (source) source.url = "http://example.test/builds";
    expectResolutionFailure(question, /must use https/);
  });

  await suite.test("unaccepted source kind", () => {
    const question = technicalQuestion();
    const source = question.sources[0];
    if (source) source.kind = "peer-reviewed-paper";
    expectResolutionFailure(question, /is not accepted for question/);
  });
});

test("C2 keeps an optional improvement out of execution without direct permission", () => {
  const report = new EvidenceResolver(catalog(optionalImprovementQuestion())).resolve(
    "Q-OPTIONAL-CACHE"
  );

  assert.equal(report.disposition, "proposal-only");
  assert.equal(report.executionProjectionChange, null);
});

test("C2 authorizes only the exact improvement directly permitted by the user", () => {
  const question = optionalImprovementQuestion();
  question.directPermission = {
    sourceKind: "direct-user",
    source: "User message: approve remote-cache for D-OPTIONAL-CACHE",
    improvementId: "remote-cache"
  };
  const report = new EvidenceResolver(catalog(question)).resolve("Q-OPTIONAL-CACHE");

  assert.equal(report.disposition, "implementation-authorized");
  assert.deepEqual(report.executionProjectionChange, {
    kind: "authorize-optional-improvement",
    improvementId: "remote-cache",
    permissionSource: "User message: approve remote-cache for D-OPTIONAL-CACHE"
  });
});

test("C2 rejects a permission for a different improvement", () => {
  const question = optionalImprovementQuestion();
  question.directPermission = {
    sourceKind: "direct-user",
    source: "User approved a different change.",
    improvementId: "different-improvement"
  };

  expectResolutionFailure(question, /permission does not match remote-cache/);
});

test("C2 rejects unnamed questions and duplicate catalog identities", () => {
  const resolver = new EvidenceResolver(catalog(technicalQuestion()));
  assert.throws(() => resolver.resolve("Q-404"), /unknown question: Q-404/);
  assert.throws(
    () => new EvidenceResolver(catalog(technicalQuestion(), technicalQuestion())),
    /question id is duplicated/
  );
});
// SPDX-License-Identifier: MPL-2.0
