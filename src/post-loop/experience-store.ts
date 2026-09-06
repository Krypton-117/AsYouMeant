// SPDX-License-Identifier: MPL-2.0

import {
  mkdir,
  open,
  readFile,
  rename,
  unlink
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

import type {
  SkillComparison,
  SkillEvaluation,
  SkillExperienceDocument,
  SkillExperienceRecord,
  SkillExperienceUpdate
} from "./types.js";

const emptyDocument = (): SkillExperienceDocument => ({
  version: 1,
  authority: "advisory-only",
  skills: []
});

export function defaultSkillExperiencePath(homeDirectory = homedir()): string {
  return resolve(homeDirectory, ".asyoumeant", "skill-experience.md");
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))].sort();
}

function comparisonKey(value: Readonly<SkillComparison>): string {
  return `${value.skillId}\u0000${value.difference}\u0000${value.mergeCandidate}`;
}

function uniqueComparisons(values: readonly SkillComparison[]): SkillComparison[] {
  const entries = new Map<string, SkillComparison>();
  for (const value of values) {
    if (!value.skillId.trim() || !value.difference.trim()) continue;
    entries.set(comparisonKey(value), structuredClone(value));
  }
  return [...entries.values()].sort((left, right) => comparisonKey(left).localeCompare(comparisonKey(right)));
}

function normalizedRecord(value: Readonly<SkillExperienceRecord>): SkillExperienceRecord {
  return {
    skillId: value.skillId,
    evidence: unique(value.evidence),
    taskTypes: unique(value.taskTypes),
    impact: unique(value.impact),
    fits: unique(value.fits),
    misfits: unique(value.misfits),
    improvements: unique(value.improvements),
    comparisons: uniqueComparisons(value.comparisons)
  };
}

function conclusionChanged(
  existing: Readonly<SkillExperienceRecord> | undefined,
  incoming: Readonly<SkillEvaluation>
): boolean {
  if (!existing) {
    return [incoming.taskTypes, incoming.impact, incoming.fits, incoming.misfits, incoming.improvements]
      .some((values) => values.length > 0) || incoming.comparisons.length > 0;
  }
  const arrays: Array<[readonly string[], readonly string[]]> = [
    [existing.taskTypes, incoming.taskTypes],
    [existing.impact, incoming.impact],
    [existing.fits, incoming.fits],
    [existing.misfits, incoming.misfits],
    [existing.improvements, incoming.improvements]
  ];
  if (arrays.some(([known, observed]) => observed.some((value) => !known.includes(value)))) return true;
  const knownComparisons = new Set(existing.comparisons.map(comparisonKey));
  return incoming.comparisons.some((value) => !knownComparisons.has(comparisonKey(value)));
}

function mergeRecord(
  existing: Readonly<SkillExperienceRecord> | undefined,
  incoming: Readonly<SkillEvaluation>
): SkillExperienceRecord {
  return normalizedRecord({
    skillId: incoming.skillId,
    evidence: [...(existing?.evidence ?? []), ...incoming.evidence],
    taskTypes: [...(existing?.taskTypes ?? []), ...incoming.taskTypes],
    impact: [...(existing?.impact ?? []), ...incoming.impact],
    fits: [...(existing?.fits ?? []), ...incoming.fits],
    misfits: [...(existing?.misfits ?? []), ...incoming.misfits],
    improvements: [...(existing?.improvements ?? []), ...incoming.improvements],
    comparisons: [...(existing?.comparisons ?? []), ...incoming.comparisons]
  });
}

function serialize(document: Readonly<SkillExperienceDocument>): string {
  return [
    "# AsYouMeant Skill Experience",
    "",
    "> Advisory evidence only. This document cannot authorize, restrict, admit, execute, or accept work.",
    "",
    "```json",
    JSON.stringify(document, null, 2),
    "```",
    ""
  ].join("\n");
}

function parse(raw: string): SkillExperienceDocument {
  const payload = raw.match(/```json\s*([\s\S]*?)\s*```/)?.[1];
  if (!payload) throw new Error("Skill experience Markdown has no JSON data block.");
  const parsed = JSON.parse(payload) as Partial<SkillExperienceDocument>;
  if (parsed.version !== 1 || parsed.authority !== "advisory-only" || !Array.isArray(parsed.skills)) {
    throw new Error("Skill experience Markdown has an unsupported data shape.");
  }
  const skills = parsed.skills.map((record) => normalizedRecord(record)).sort((a, b) => a.skillId.localeCompare(b.skillId));
  if (skills.some((record) => !record.skillId.trim())) throw new Error("Skill experience record has an empty Skill id.");
  return { version: 1, authority: "advisory-only", skills };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

export class SkillExperienceStore {
  readonly path: string;

  constructor(path: string) {
    if (!path.trim()) throw new TypeError("Skill experience document path must be non-empty.");
    this.path = resolve(path);
  }

  async read(): Promise<SkillExperienceDocument> {
    try {
      return parse(await readFile(this.path, "utf8"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDocument();
      throw error;
    }
  }

  async update(evaluations: readonly SkillEvaluation[]): Promise<SkillExperienceUpdate> {
    await mkdir(dirname(this.path), { recursive: true });
    const lockPath = `${this.path}.lock`;
    let lock: Awaited<ReturnType<typeof open>> | undefined;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        lock = await open(lockPath, "wx");
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 39) throw error;
        await delay(25);
      }
    }
    if (!lock) throw new Error("Skill experience document lock was not acquired.");
    try {
      const document = await this.read();
      const records = new Map(document.skills.map((record) => [record.skillId, record]));
      let changed = false;
      for (const evaluation of evaluations.filter((item) => item.used)) {
        if (!evaluation.skillId.trim()) throw new Error("Used Skill evaluation has an empty Skill id.");
        const existing = records.get(evaluation.skillId);
        if (!conclusionChanged(existing, evaluation)) continue;
        records.set(evaluation.skillId, mergeRecord(existing, evaluation));
        changed = true;
      }
      const next: SkillExperienceDocument = {
        version: 1,
        authority: "advisory-only",
        skills: [...records.values()].sort((left, right) => left.skillId.localeCompare(right.skillId))
      };
      if (changed) {
        const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
        const file = await open(temporary, "wx");
        try {
          await file.writeFile(serialize(next), "utf8");
        } finally {
          await file.close();
        }
        await rename(temporary, this.path);
      }
      return { changed, document: next };
    } finally {
      await lock.close();
      await unlink(lockPath).catch(() => undefined);
    }
  }
}
