import assert from "node:assert/strict";
import test from "node:test";

import { presentAcceptance } from "../src/index.js";

test("C13 produces the zero-prerequisite P1 acceptance package", () => {
  const result = presentAcceptance({
    nodeId: "P1",
    title: "AsYouMeant 0.2.0 Product",
    result: "passed",
    evidence: ["M3 CLOSED", "C14 PASS", "C15 PASS", "C12 PASS", "C13 PASS"],
    shortestSteps: [
      "阅读 README.zh-CN.md 的零基础指南",
      "点击顶部 English 链接，再从英文页返回简体中文",
      "在仓库运行 pnpm demo:m2",
      "确认看见 pre-start 拒绝和合法许可允许",
      "明确回复接受或拒绝 P1"
    ],
    expectedResult: "用户能看懂双语指南，并看见非法启动被拒绝、合法许可链路被允许。",
    failureMeaning: "任一步骤与预期不符都应拒绝 P1，且不得推送 GitHub。",
    evidenceLocation: "project-associated ledger",
    executor: "Agent",
    acceptor: "User",
    nextStep: "等待用户明确接受或拒绝 P1；接受前不推送 GitHub。",
    limitation: "Claude Code 仅合同验证；DSH 仅对 0.1.1-rc.2 得出 VERIFIED_COMPATIBLE。"
  });
  assert.equal(result.result, "passed");
  assert.match(result.summary, /已通过/);
  assert.equal(result.nodeId, "P1");
  assert.equal(result.shortestSteps.length, 5);
  assert.match(result.nextStep, /接受前不推送 GitHub/);
  assert.match(result.limitation ?? "", /0\.1\.1-rc\.2/);
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

test("C13 refuses blank instructions and responsibility fields", () => {
  assert.throws(() => presentAcceptance({
    nodeId: "P1",
    title: "AsYouMeant 0.2.0 Product",
    result: "passed",
    evidence: ["C12 PASS"],
    shortestSteps: ["   "],
    expectedResult: "Visible result",
    failureMeaning: "Reject P1",
    evidenceLocation: "ledger",
    executor: " ",
    acceptor: "User",
    nextStep: "Wait for acceptance"
  }), /non-empty/i);
});
// SPDX-License-Identifier: MPL-2.0
