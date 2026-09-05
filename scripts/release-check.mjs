import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const secretPattern = /(sk-[a-z0-9]{16,}|bearer\s+[a-z0-9]|api[_-]?key\s*[:=]|password\s*[:=])/i;
const ignoredDirectories = new Set([".git", ".work", "dist", "node_modules"]);
const inspectTextFiles = (directory) => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) inspectTextFiles(join(directory, entry.name));
      continue;
    }
    const path = join(directory, entry.name);
    try {
      const content = readFileSync(path, "utf8");
      if (secretPattern.test(content)) failures.push(`secret-shaped text: ${path.slice(root.length + 1)}`);
    } catch {
      // Binary or unreadable files are outside the text scan.
    }
  }
};
const readJson = (relative) => {
  const path = join(root, relative);
  if (!existsSync(path)) {
    failures.push(`missing release file: ${relative}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    failures.push(`invalid JSON: ${relative}`);
    return null;
  }
};

const product = readJson("package.json");
const codex = readJson("native/codex/.codex-plugin/plugin.json");
const claude = readJson("native/claude/.claude-plugin/plugin.json");
const opencode = readJson("native/opencode/package.json");

if (!existsSync(join(root, ".git"))) failures.push("repository is not git-initialized");
if (product?.version !== "0.1.0") failures.push("root Product version must be 0.1.0");
if (product?.license !== "MPL-2.0") failures.push("root Product license must be MPL-2.0");
for (const [name, manifest] of [["Codex", codex], ["Claude Code", claude], ["OpenCode", opencode]]) {
  if (manifest?.version !== "0.1.0") failures.push(`${name} artifact version differs from Product`);
  if (manifest?.license !== "MPL-2.0") failures.push(`${name} artifact license must be MPL-2.0`);
}
if (!existsSync(join(root, "native/codex/hooks/codex-hooks.json"))) failures.push("Codex hooks are absent");
if (!existsSync(join(root, "native/claude/hooks/hooks.json"))) failures.push("Claude Code hooks are absent");
if (!existsSync(join(root, "native/opencode/CONTRACT-EVIDENCE.json"))) failures.push("OpenCode contract evidence is absent");
if (existsSync(join(root, "native/dsh"))) failures.push("DSH artifact must not be released");
if (product?.dependencies?.["@deepseek-ai/dsh"] || product?.devDependencies?.["@deepseek-ai/dsh"]) {
  failures.push("DSH must not be a release dependency");
}
inspectTextFiles(root);

const report = {
  candidate: "2026-09-05.1",
  productVersion: product?.version ?? null,
  artifacts: ["codex", "claude-code", "opencode"],
  dshReleased: false,
  checked: ["git repository", "release inputs", "secret-shaped text", "MPL-2.0", "OpenCode contract evidence", "artifact versions", "DSH exclusion"],
  status: failures.length === 0 ? "PASS" : "FAIL",
  failures
};
console.log(JSON.stringify(report, null, 2));
process.exit(failures.length === 0 ? 0 : 1);
