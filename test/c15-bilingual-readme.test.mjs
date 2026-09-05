// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { auditReadmes } from "../scripts/release-check.mjs";

const fixture = resolve(".work", "qa", "bootstrap-2026-09-05.2", "c15");
const required = [
  "0.2.0",
  "Component",
  "Module",
  "Product",
  "pre-loop",
  "major-loop",
  "pnpm demo:m2",
  "MPL-2.0",
  "THIRD_PARTY_NOTICES.md",
  "0.1.1-rc.2",
  "VERIFIED_COMPATIBLE"
].join("\n");

function writePair(english, chinese) {
  rmSync(fixture, { recursive: true, force: true });
  mkdirSync(fixture, { recursive: true });
  writeFileSync(join(fixture, "THIRD_PARTY_NOTICES.md"), "notices\n", "utf8");
  writeFileSync(join(fixture, "README.md"), english, "utf8");
  writeFileSync(join(fixture, "README.zh-CN.md"), chinese, "utf8");
}

test("C15 accepts bilingual beginner-first documentation", () => {
  assert.deepEqual(auditReadmes(process.cwd()), []);
});

test("C15 rejects wrong ordering, missing language entry, and broken local links", () => {
  writePair(
    `[简体中文](README.zh-CN.md)\n<!-- BEGINNER_GUIDE -->\n${required}\n<!-- PROFESSIONAL_GUIDE -->\n`,
    `[English](README.md)\n<!-- BEGINNER_GUIDE -->\n${required}\n<!-- PROFESSIONAL_GUIDE -->\n`
  );
  assert.deepEqual(auditReadmes(fixture), []);

  writeFileSync(
    join(fixture, "README.md"),
    `# Wrong first line\n[简体中文](README.zh-CN.md)\n<!-- PROFESSIONAL_GUIDE -->\n${required}\n<!-- BEGINNER_GUIDE -->\n[missing](missing.md)\n`,
    "utf8"
  );
  const failures = auditReadmes(fixture).join("\n");
  assert.match(failures, /language link must be first/);
  assert.match(failures, /beginner guide first/);
  assert.match(failures, /broken local link/);

  rmSync(fixture, { recursive: true, force: true });
});
