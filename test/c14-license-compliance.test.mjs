// SPDX-License-Identifier: MPL-2.0

import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { auditLicense } from "../scripts/release-check.mjs";

const fixture = resolve(".work", "qa", "bootstrap-2026-09-05.2", "c14");
const manifests = [
  "package.json",
  "native/codex/.codex-plugin/plugin.json",
  "native/claude/.claude-plugin/plugin.json",
  "native/opencode/package.json",
  "native/dsh/package.json"
];

function prepareFixture() {
  rmSync(fixture, { recursive: true, force: true });
  for (const path of manifests) {
    mkdirSync(resolve(fixture, path, ".."), { recursive: true });
    writeFileSync(join(fixture, path), '{"license":"MPL-2.0"}\n', "utf8");
  }
  mkdirSync(join(fixture, "src"), { recursive: true });
  writeFileSync(join(fixture, "src", "owned.ts"), "// SPDX-License-Identifier: MPL-2.0\n", "utf8");
  copyFileSync("LICENSE", join(fixture, "LICENSE"));
  copyFileSync("THIRD_PARTY_NOTICES.md", join(fixture, "THIRD_PARTY_NOTICES.md"));
}

test("C14 accepts the real repository license set", () => {
  assert.deepEqual(auditLicense(process.cwd()), []);
});

test("C14 accepts the MPL-2.0 set and rejects every required negative case", () => {
  prepareFixture();
  assert.deepEqual(auditLicense(fixture), []);

  const license = readFileSync(join(fixture, "LICENSE"), "utf8");
  writeFileSync(join(fixture, "LICENSE"), "", "utf8");
  assert.match(auditLicense(fixture).join("\n"), /empty release file: LICENSE/);
  writeFileSync(join(fixture, "LICENSE"), license, "utf8");

  writeFileSync(join(fixture, manifests[0]), '{"license":"MIT"}\n', "utf8");
  assert.match(auditLicense(fixture).join("\n"), /package\.json license must be MPL-2\.0/);
  writeFileSync(join(fixture, manifests[0]), '{"license":"MPL-2.0"}\n', "utf8");

  writeFileSync(join(fixture, "src", "owned.ts"), "export {};\n", "utf8");
  assert.match(auditLicense(fixture).join("\n"), /missing MPL-2\.0 SPDX header/);
  writeFileSync(join(fixture, "src", "owned.ts"), "// SPDX-License-Identifier: MPL-2.0\n", "utf8");

  writeFileSync(join(fixture, "THIRD_PARTY_NOTICES.md"), "Superpowers\n", "utf8");
  const noticeFailures = auditLicense(fixture).join("\n");
  assert.match(noticeFailures, /Stop That Shit 0\.2\.0/);
  assert.match(noticeFailures, /Matt Pocock Skills manifest 1\.2\.3/);

  rmSync(fixture, { recursive: true, force: true });
});
