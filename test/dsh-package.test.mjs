// SPDX-License-Identifier: MPL-2.0
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { packDsh } from "../scripts/pack-dsh.mjs";

test("DSH tarball contains standalone runtime, all Skills and license notices", async () => {
  const packed = packDsh();
  const expected = ["package.json", "asyoumeant-dsh.js", "cordis.patch.yml", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CONTRACT-EVIDENCE.json",
    ...["pre-loop-governor", "evidence-research", "asyoumeant-major-loop-runner", "diagnostic-kernel", "post-loop-curator"].map((skill) => `skills/${skill}/SKILL.md`)];
  assert.deepEqual([...packed.files].sort(), expected.sort());
  const directory = mkdtempSync(resolve(".work", "dsh-package-"));
  try {
    const unpack = spawnSync("tar", ["-xzf", packed.path, "-C", directory], { encoding: "utf8", timeout: 10000 });
    assert.equal(unpack.status, 0, unpack.error?.message ?? unpack.stderr);
    const root = join(directory, "package");
    const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    assert.equal(manifest.repository.directory, "native/dsh");
    assert.equal(manifest.publishConfig.access, "public");
    assert.equal(manifest.dependencies, undefined);
    assert.equal(manifest.scripts, undefined);
    const plugin = await import(pathToFileURL(join(root, "asyoumeant-dsh.js")).href);
    const handlers = new Map();
    let provider;
    plugin.apply({
      skills: { registerProvider(factory) { provider = factory({}); return () => {}; } },
      tools: { register() {} },
      on(name, handler) { handlers.set(name, handler); }
    });
    const skills = await provider.list();
    assert.equal(skills.length, 5);
    for (const skill of skills) assert.ok((await provider.get(skill)).content.includes("#"), skill.name);
    assert.equal((await handlers.get("tools/pre-execute")({ name: "write", agent: {} }, async () => ({ kind: "allow" }))).kind, "allow");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
