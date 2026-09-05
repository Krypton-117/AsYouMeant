// SPDX-License-Identifier: MPL-2.0

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, relative, resolve } from "node:path";

const PRODUCT_VERSION = "0.2.0";
const CANDIDATE = "2026-09-05.2";
const SPDX = "SPDX-License-Identifier: MPL-2.0";
const SOURCE_EXTENSIONS = new Set([".ts", ".js", ".mjs", ".cjs", ".yml", ".yaml"]);
const ignoredDirectory = (root, directory, name) =>
  name === ".git" || name === ".work" || name === "node_modules" || name === ".pnpm-store" ||
  (name === "dist" && resolve(directory) === resolve(root));

const readText = (root, path, failures, label = path) => {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    failures.push(`missing release file: ${label}`);
    return null;
  }
  const content = readFileSync(absolute, "utf8");
  if (content.trim().length === 0) failures.push(`empty release file: ${label}`);
  return content;
};

const readJson = (root, path, failures) => {
  const content = readText(root, path, failures);
  if (content === null || content.trim().length === 0) return null;
  try {
    return JSON.parse(content);
  } catch {
    failures.push(`invalid JSON: ${path}`);
    return null;
  }
};

const walkFiles = (root, directory, visit) => {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectory(root, directory, entry.name)) walkFiles(root, join(directory, entry.name), visit);
    } else {
      visit(join(directory, entry.name));
    }
  }
};

export function auditLicense(rootInput) {
  const root = resolve(rootInput);
  const failures = [];
  const license = readText(root, "LICENSE", failures);
  if (license && (
    !license.startsWith("Mozilla Public License Version 2.0\n\n==================================\n") ||
    !license.includes("3.1. Distribution of Source Form") ||
    !license.includes("6. Disclaimer of Warranty") ||
    !license.includes("Exhibit A - Source Code Form License Notice") ||
    !license.trimEnd().endsWith('defined by the Mozilla Public License, v. 2.0.')
  )) failures.push("LICENSE is not the unmodified MPL-2.0 text");

  const manifests = [
    "package.json",
    "native/codex/.codex-plugin/plugin.json",
    "native/claude/.claude-plugin/plugin.json",
    "native/opencode/package.json",
    "native/dsh/package.json"
  ];
  for (const path of manifests) {
    const manifest = readJson(root, path, failures);
    if (manifest?.license !== "MPL-2.0") failures.push(`${path} license must be MPL-2.0`);
  }

  const notices = readText(root, "THIRD_PARTY_NOTICES.md", failures);
  for (const required of [
    "Superpowers 6.3.0 — Copyright 2025 Jesse Vincent",
    "https://github.com/obra/superpowers",
    "Stop That Shit 0.2.0 — Copyright 2026 Stop That Shit contributors",
    "https://github.com/lennney/stop-that-shit",
    "Matt Pocock Skills manifest 1.2.3 — Copyright 2026 Matt Pocock",
    "https://github.com/mattpocock/skills",
    "Permission is hereby granted, free of charge"
  ]) {
    if (notices && !notices.includes(required)) failures.push(`missing upstream notice: ${required}`);
  }

  for (const sourceRoot of ["src", "test", "scripts", "native"]) {
    walkFiles(root, join(root, sourceRoot), (path) => {
      const local = relative(root, path).replaceAll("\\", "/");
      if (!SOURCE_EXTENSIONS.has(extname(path)) || local === "pnpm-lock.yaml") return;
      const content = readFileSync(path, "utf8");
      if (!content.includes(SPDX)) failures.push(`missing MPL-2.0 SPDX header: ${local}`);
    });
  }
  const workspace = join(root, "pnpm-workspace.yaml");
  if (existsSync(workspace) && !readFileSync(workspace, "utf8").includes(SPDX)) {
    failures.push("missing MPL-2.0 SPDX header: pnpm-workspace.yaml");
  }
  return failures;
}

export function auditReadmes(rootInput) {
  const root = resolve(rootInput);
  const failures = [];
  const english = readText(root, "README.md", failures);
  const chinese = readText(root, "README.zh-CN.md", failures);
  const shared = [
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
  ];
  for (const item of shared) {
    if (english && !english.includes(item)) failures.push(`README.md omits ${item}`);
    if (chinese && !chinese.includes(item)) failures.push(`README.zh-CN.md omits ${item}`);
  }
  if (english && !english.startsWith("[简体中文](README.zh-CN.md)")) failures.push("README.md language link must be first");
  if (chinese && !chinese.startsWith("[English](README.md)")) failures.push("README.zh-CN.md language link must be first");
  for (const [name, content] of [["README.md", english], ["README.zh-CN.md", chinese]]) {
    if (!content) continue;
    const beginner = content.indexOf("BEGINNER_GUIDE");
    const professional = content.indexOf("PROFESSIONAL_GUIDE");
    if (beginner < 0 || professional < 0 || beginner > professional) failures.push(`${name} must put the beginner guide first`);
    for (const link of content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = link[1];
      if (/^(https?:|#)/.test(target)) continue;
      if (!existsSync(join(root, target))) failures.push(`${name} has a broken local link: ${target}`);
    }
  }
  return failures;
}

export function auditRelease(rootInput = process.cwd()) {
  const root = resolve(rootInput);
  const failures = [...auditLicense(root), ...auditReadmes(root)];
  const product = readJson(root, "package.json", failures);
  if (!existsSync(join(root, ".git"))) failures.push("repository is not git-initialized");
  if (product?.version !== PRODUCT_VERSION) failures.push(`root Product version must be ${PRODUCT_VERSION}`);
  for (const [name, path] of [
    ["Codex", "native/codex/.codex-plugin/plugin.json"],
    ["Claude Code", "native/claude/.claude-plugin/plugin.json"],
    ["OpenCode", "native/opencode/package.json"],
    ["DSH", "native/dsh/package.json"]
  ]) {
    const manifest = readJson(root, path, failures);
    if (manifest?.version !== PRODUCT_VERSION) failures.push(`${name} artifact version differs from Product`);
  }
  if (product?.dependencies?.["@deepseek-ai/dsh"] || product?.devDependencies?.["@deepseek-ai/dsh"]) {
    failures.push("DSH must remain outside release dependencies");
  }
  const dshEvidence = readJson(root, "native/dsh/CONTRACT-EVIDENCE.json", failures);
  if (dshEvidence?.hostVersion !== "0.1.1-rc.2" || !["VERIFIED_COMPATIBLE", "VERIFIED_INCOMPATIBLE"].includes(dshEvidence?.outcome)) {
    failures.push("DSH evidence must contain the exact experimental version and conclusion");
  }

  const secretPattern = /(sk-[a-z0-9]{16,}|bearer\s+[a-z0-9._-]{16,}|(api[_-]?key|token|password)\s*[:=]\s*["']?[a-z0-9._-]{20,})/i;
  walkFiles(root, root, (path) => {
    try {
      const content = readFileSync(path, "utf8");
      if (secretPattern.test(content)) failures.push(`secret-shaped text: ${relative(root, path)}`);
    } catch {
      // Binary or unreadable files are outside the text scan.
    }
  });

  return {
    candidate: CANDIDATE,
    productVersion: product?.version ?? null,
    artifacts: ["codex", "claude-code", "opencode"],
    experimentalArtifact: "dsh@0.1.1-rc.2",
    checked: ["git repository", "release inputs", "secret-shaped text", "MPL-2.0", "upstream MIT notices", "artifact versions", "bilingual README", "DSH evidence"],
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures: [...new Set(failures)].sort()
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const report = auditRelease(process.cwd());
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "PASS" ? 0 : 1);
}
