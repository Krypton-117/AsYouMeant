// SPDX-License-Identifier: MPL-2.0

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const DSH_VERSION = "0.1.1-rc.2";
export const DSH_START_SOURCE = "dsh-skill-invocation";
export const DSH_SKILL_NAME = "asyoumeant-major-loop-runner";
export const DSH_SELFCHECK_TOOL = "asyoumeant_selfcheck";
export const name = "asyoumeant-dsh";
export const inject = ["skills", "tools"];

const providerName = "asyoumeant-dsh";
const skillSpecs = [
  {
    name: "pre-loop-governor",
    description: "Prepare an AsYouMeant development contract through detailed intent discussion before implementation begins.",
    invocation: { modelInvocable: true, userInvocable: true }
  },
  {
    name: "evidence-research",
    description: "Resolve one named technical uncertainty for a contracted consumer using high-trust primary evidence.",
    invocation: { modelInvocable: true, userInvocable: true }
  },
  {
    name: DSH_SKILL_NAME,
    description: "Use when the user explicitly starts or resumes a DSH task governed by a reviewed AsYouMeant contract.",
    invocation: { modelInvocable: false, userInvocable: true }
  },
  {
    name: "diagnostic-kernel",
    description: "Diagnose a contracted failure with one evidence-bound, discriminating probe and a fixed retry budget.",
    invocation: { modelInvocable: true, userInvocable: true }
  },
  {
    name: "post-loop-curator",
    description: "Use when an AsYouMeant Product has closed and the task has evaluable evidence from Skills used during the task.",
    invocation: { modelInvocable: true, userInvocable: false }
  }
].map((spec) => {
  const directoryUrl = new URL(`./skills/${spec.name}/`, import.meta.url);
  return {
    ...spec,
    provider: providerName,
    source: "bundled",
    resourceBase: { kind: "directory", path: fileURLToPath(directoryUrl) },
    rank: 600,
    locator: new URL("SKILL.md", directoryUrl)
  };
});

const provider = {
  name: providerName,
  async list() {
    // Discovery has no task identity; admission is checked in tools/pre-execute.
    return skillSpecs;
  },
  async get(candidate) {
    const current = skillSpecs.find((entry) => entry.name === candidate.name);
    if (!current) return undefined;
    return {
      ...current,
      content: await readFile(current.locator, "utf8")
    };
  }
};
const readOnlyTools = new Set(["read", "read_image", "glob", "grep", "skill", "web_search"]);

function messageText(message) {
  return Array.isArray(message?.content)
    ? message.content.filter((block) => block?.type === "text").map((block) => block.text).join("\n")
    : "";
}

function contractPath(agent) {
  return process.env.ASYOUMEANT_CONTRACT_PATH
    ?? join(agent?.session?.header?.cwd ?? process.cwd(), ".asyoumeant", "contract.json");
}

async function readContract(agent) {
  try {
    const parsed = JSON.parse(await readFile(contractPath(agent), "utf8"));
    if (typeof parsed?.candidateVersion !== "string" || typeof parsed?.projectionIdentity !== "string") return null;
    if (parsed?.review?.result !== "PRE_LOOP_REVIEW_PASSED") return null;
    if (parsed.review.candidateVersion !== parsed.candidateVersion) return null;
    if (parsed.review.projectionIdentity !== parsed.projectionIdentity) return null;
    const allowedTools = Array.isArray(parsed?.dsh?.allowedTools)
      ? parsed.dsh.allowedTools.filter((tool) => typeof tool === "string")
      : [];
    const permitDurationMs = Number.isSafeInteger(parsed?.dsh?.permitDurationMs)
      && parsed.dsh.permitDurationMs > 0
      ? parsed.dsh.permitDurationMs
      : 3_600_000;
    return {
      candidateVersion: parsed.candidateVersion,
      projectionIdentity: parsed.projectionIdentity,
      allowedTools,
      permitDurationMs,
      skillPoolEntries: Array.isArray(parsed?.skillPool?.entries) ? parsed.skillPool.entries : null
    };
  } catch {
    return null;
  }
}

function hasExactStart(messages, command) {
  return messages.some((message) => {
    if (message?.source?.kind !== "user") return false;
    const firstLine = messageText(message).split(/\r?\n/, 1)[0]?.trim();
    return firstLine === command;
  });
}

function hasInjectedSkill(decision) {
  return decision?.kind === "enter" && decision.messages.some(
    (message) => message?.source?.kind === "skill-invocation"
      && message.source.name === DSH_SKILL_NAME
      && message.source.form === "instructions"
  );
}

function activePermit(permits, agent, contract) {
  const permit = permits.get(agent);
  if (!permit || !contract) return null;
  if (permit.candidateVersion !== contract.candidateVersion) return null;
  if (permit.projectionIdentity !== contract.projectionIdentity) return null;
  if (Date.now() >= permit.expiresAt) return null;
  return permit;
}

export function apply(ctx) {
  const permits = new WeakMap();
  const modes = new WeakMap();
  const lastPrompts = new WeakMap();
  let invalidateSkillPool = () => undefined;
  const disposeSkillProvider = ctx.skills.registerProvider((control) => {
    invalidateSkillPool = control?.invalidate ?? (() => undefined);
    return provider;
  });

  ctx.on("agent/pre-step", async ({ agent, messages }, next) => {
    const latest = messages.filter((message) => message?.source?.kind === "user").at(-1);
    const text = messageText(latest).trim();
    const promptIdentity = latest?.id ?? text;
    const newPrompt = latest && lastPrompts.get(agent) !== promptIdentity;
    if (newPrompt) {
      lastPrompts.set(agent, promptIdentity);
      const match = /^AYM mode (ordinary|research|aym)$/i.exec(text);
      const mode = match?.[1]?.toLowerCase()
        ?? (/^(?:退出|关闭|停止使用)\s*AYM[。.!！]?$/i.test(text) ? "ordinary" : null)
        ?? (/^(?:只读研究|研究模式)[。.!！]?$/.test(text) ? "research" : null)
        ?? (/^(?:(?:请)?(?:使用\s*(?:AYM|AsYouMeant|pre-loop)|进入\s*major-loop|按\s*AYM\s*合同开发)|use\s+(?:AYM|AsYouMeant|pre-loop)\b|enter\s+major-loop\b|\/asyoumeant-major-loop-runner start )/i.test(text) ? "aym" : null);
      if (mode) { modes.set(agent, mode); permits.delete(agent); }
    }
    invalidateSkillPool();
    const decision = await next();
    if (decision.kind === "reject") return decision;
    const contract = await readContract(agent);
    if (!contract) return decision;
    const command = `/${DSH_SKILL_NAME} start candidate=${contract.candidateVersion}`;
    if (!newPrompt || !latest || !hasExactStart([latest], command) || !hasInjectedSkill(decision)) return decision;
    if (activePermit(permits, agent, contract)) return decision;
    modes.set(agent, "aym");
    const issuedAt = Date.now();
    permits.set(agent, {
      candidateVersion: contract.candidateVersion,
      projectionIdentity: contract.projectionIdentity,
      issuedAt,
      expiresAt: issuedAt + contract.permitDurationMs,
      sourceKind: DSH_START_SOURCE
    });
    return decision;
  }, { prepend: true });

  ctx.on("tools/pre-execute", async (exec, next) => {
    const mode = modes.get(exec.agent) ?? "ordinary";
    if (mode === "ordinary") return next();
    if (mode === "research") {
      if (readOnlyTools.has(exec.name) && exec.name !== "skill") return next();
      return { kind: "deny", reason: `Action ${exec.name}; mode=research. Only read-only tools are authorized; execution, installation, publishing and other side effects are forbidden. Use read, grep or web_search. Send 'AYM mode ordinary' to exit, or 'AYM mode aym' to prepare pre-loop; after independent review use /${DSH_SKILL_NAME} start candidate=<reviewed-version>.` };
    }
    if (exec.name === "skill") {
      const contract = await readContract(exec.agent);
      const requested = String(exec.args?.name ?? exec.args?.skill ?? "");
      if (requested && contract?.skillPoolEntries) {
        const active = contract.skillPoolEntries.some(
          (entry) => entry?.skillId === requested && entry?.status === "in-pool"
        );
        if (!active) return { kind: "deny", reason: `SKILL_OUT_OF_POOL: Action skill ${requested}; mode=aym. Skill is outside the approved pool. Revise pre-loop and independent review, then use /${DSH_SKILL_NAME} start candidate=${contract.candidateVersion}. Read-only tools remain available; send AYM mode ordinary or AYM mode research to switch.` };
      }
      return next();
    }
    if (readOnlyTools.has(exec.name)) return next();
    const contract = await readContract(exec.agent);
    if (!activePermit(permits, exec.agent, contract)) {
      return { kind: "deny", reason: `PRE_START_HARD_LOCK: Action ${exec.name}; mode=aym. No current reviewed permit matches this contract and time. Complete independent pre-loop review, then enter /${DSH_SKILL_NAME} start candidate=${contract?.candidateVersion ?? "<reviewed-version>"}. Read-only read/grep/web_search remains available. Send 'AYM mode research' or 'AYM mode ordinary' to switch and invalidate the old permit.` };
    }
    if (!contract.allowedTools.includes(exec.name)) {
      return { kind: "deny", reason: `TOOL_OUTSIDE_CONTRACT: Action ${exec.name}; mode=aym. Tool permission is absent. Revise and independently review the contract, then use /${DSH_SKILL_NAME} start candidate=${contract.candidateVersion}. Read-only reads remain available; send 'AYM mode ordinary' or 'AYM mode research' to switch.` };
    }
    return next();
  });

  ctx.tools.register({
    name: DSH_SELFCHECK_TOOL,
    description: "Report the active AsYouMeant permit without changing files, configuration, or external state.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["status", "candidateVersion", "sourceKind"],
        properties: {
          status: { type: "string", enum: ["ACTIVE"] },
          candidateVersion: { type: "string" },
          sourceKind: { type: "string", enum: [DSH_START_SOURCE] }
        }
      },
      render(_args, value) {
        return [{ type: "text", text: `AsYouMeant permit ${value.status} for ${value.candidateVersion}.` }];
      }
    },
    async execute(_args, exec) {
      const contract = await readContract(exec.agent);
      const permit = activePermit(permits, exec.agent, contract);
      if (!permit) throw new Error("AsYouMeant permit is not active.");
      return {
        status: "ACTIVE",
        candidateVersion: permit.candidateVersion,
        sourceKind: permit.sourceKind
      };
    }
  });

  return disposeSkillProvider;
}
