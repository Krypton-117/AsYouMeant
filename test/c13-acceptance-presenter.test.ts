import assert from "node:assert/strict";
import test from "node:test";

import { presentAcceptance } from "../src/index.js";

test("C13 produces a zero-prerequisite acceptance package with every required field", () => {
  const result = presentAcceptance({
    nodeId: "M4",
    title: "最终一致性",
    result: "passed",
    evidence: ["C11 PASS", "C12 PASS"],
    shortestSteps: ["阅读三项宿主结论", "回复接受M4"],
    expectedResult: "进入 Product 总装，不立即写入 GitHub。",
    failureMeaning: "任一冲突都会保持门禁关闭。",
    evidenceLocation: "project-associated ledger",
    executor: "Agent",
    acceptor: "User",
    nextStep: "等待用户验收",
    limitation: "Claude Code 仅合同验证，未做真实宿主测试。"
  });
  assert.equal(result.result, "passed");
  assert.match(result.summary, /已通过/);
  assert.equal(result.shortestSteps.length, 2);
  assert.match(result.limitation ?? "", /未做真实宿主测试/);
});

test("C13 refuses an evidence-free presentation", () => {
  assert.throws(() => presentAcceptance({
    nodeId: "M4",
    title: "最终一致性",
    result: "passed",
    evidence: [],
    shortestSteps: ["回复接受M4"],
    expectedResult: "进入 Product 总装。",
    failureMeaning: "保持门禁关闭。",
    evidenceLocation: "project-associated ledger",
    executor: "Agent",
    acceptor: "User",
    nextStep: "等待用户验收"
  }), /evidence is required/i);
});
