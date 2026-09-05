import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  FileOpenCodePermitStore,
  OpenCodeGuardDenial,
  createOpenCodeHooks,
  handleOpenCodeCommand,
  handleOpenCodeTool,
  registerOpenCodeCommand
} from "../asyoumeant-runtime/dist/src/hosts/opencode/adapter.js";
import {
  openCodeSkillIsInPool,
  projectOpenCodeSkillPool
} from "../asyoumeant-runtime/dist/src/hosts/skill-pool.js";

function contractFile(directory) {
  return process.env.ASYOUMEANT_CONTRACT_PATH || join(directory, ".asyoumeant", "contract.json");
}

function readContractAt(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function addLegacyPoolPermissions(config, projection) {
  if (config.permission === undefined) config.permission = {};
  if (config.permission && typeof config.permission === "object" && !Array.isArray(config.permission)) {
    const existing = config.permission.skill;
    if (existing === undefined || (existing && typeof existing === "object" && !Array.isArray(existing))) {
      config.permission.skill = {
        ...(existing ?? {}),
        ...projection.permission.skill
      };
    }
  }
  if (config.permissions === undefined) config.permissions = [];
  if (Array.isArray(config.permissions)) config.permissions.push(...projection.permissions);
}

async function AsYouMeantOpenCodePlugin({ directory }) {
  const contractPath = contractFile(directory);
  const stateRoot = process.env.ASYOUMEANT_STATE_DIR || join(directory, ".asyoumeant", "opencode-state");
  const evidencePath = join(stateRoot, "plugin-loaded.json");
  let runtime = null;

  const readContract = () => readContractAt(contractPath);

  const loadRuntime = () => {
    if (runtime) return runtime;
    const contract = readContract();
    if (!contract) return null;
    runtime = createOpenCodeHooks(contract, new FileOpenCodePermitStore(join(stateRoot, "permits")));
    return runtime;
  };

  return {
    config: async (config) => {
      registerOpenCodeCommand(config);
      const contract = readContract();
      if (contract?.skillPool) {
        addLegacyPoolPermissions(config, projectOpenCodeSkillPool(contract.skillPool));
      }
      mkdirSync(dirname(evidencePath), { recursive: true });
      writeFileSync(evidencePath, `${JSON.stringify({
        host: "OpenCode",
        version: "1.18.18",
        registration: "config.command",
        sourceRecognition: "command.execute.before",
        guard: "tool.execute.before"
      }, null, 2)}\n`, "utf8");
    },
    "command.execute.before": async (input, output) => {
      const hooks = loadRuntime();
      if (hooks) await hooks["command.execute.before"]?.(input, output);
    },
    "tool.execute.before": async (input, output) => {
      const contract = readContract();
      const skillId = input.tool === "skill"
        ? String(output?.args?.name ?? output?.args?.skill ?? output?.args?.id ?? "")
        : "";
      if (skillId && contract?.skillPool && !openCodeSkillIsInPool(contract.skillPool, skillId)) {
        throw new Error(`[SKILL_OUT_OF_POOL] ${skillId}`);
      }
      const hooks = loadRuntime();
      if (hooks) await hooks["tool.execute.before"]?.(input, output);
    }
  };
}

AsYouMeantOpenCodePlugin.id = "asyoumeant";
AsYouMeantOpenCodePlugin.setup = async (ctx) => {
  const directory = ctx.location?.directory ?? process.cwd();
  const contractPath = contractFile(directory);
  const readContract = () => readContractAt(contractPath);
  const stateRoot = process.env.ASYOUMEANT_STATE_DIR || join(directory, ".asyoumeant", "opencode-state");
  const permitStore = new FileOpenCodePermitStore(join(stateRoot, "permits"));
  const registrations = [];

  if (ctx.command?.transform) {
    registrations.push(await ctx.command.transform((editor) => {
      editor.add({
        name: "asyoumeant-start",
        description: "Start the reviewed AsYouMeant major-loop",
        async execute({ sessionID, prompt, delivery }) {
          const contract = readContract();
          if (!contract) throw new Error("AsYouMeant contract is unavailable.");
          if (contract.skillPool && !openCodeSkillIsInPool(contract.skillPool, "major-loop-runner")) {
            throw new Error("SKILL_OUT_OF_POOL: major-loop-runner");
          }
          const result = handleOpenCodeCommand({
            command: "asyoumeant-start",
            sessionID,
            arguments: String(prompt?.text ?? "").trim()
          }, contract, permitStore);
          if (!result.sourceRecognized) throw new Error("AsYouMeant candidate does not match the reviewed contract.");
          await ctx.session.prompt({
            ...prompt,
            sessionID,
            text: `AsYouMeant permit ACTIVE for ${contract.candidateVersion}. Execute only the reviewed contract.`,
            skills: [...new Set([...(prompt?.skills ?? []), "major-loop-runner"])],
            delivery
          });
        }
      });
    }));
  }

  if (ctx.skill?.transform) {
    registrations.push(await ctx.skill.transform((editor) => {
      const entries = readContract()?.skillPool?.entries;
      if (!Array.isArray(entries) || typeof editor.remove !== "function") return;
      for (const entry of entries) {
        if (entry?.status === "out-of-pool" && typeof entry.skillId === "string") {
          editor.remove(entry.skillId);
        }
      }
    }));
  }

  if (ctx.session?.hook && ctx.skill?.reload) {
    registrations.push(await ctx.session.hook("prompt", async () => {
      await ctx.skill.reload();
    }));
  }

  if (ctx.permission?.hook) {
    registrations.push(await ctx.permission.hook("evaluate", (event) => {
      if (event.action !== "skill") return;
      const projection = readContract()?.skillPool;
      if (!projection) return;
      const denied = event.resources.find((skillId) => !openCodeSkillIsInPool(projection, skillId));
      if (!denied) return;
      event.effect = "deny";
      event.message = `SKILL_OUT_OF_POOL: ${denied}`;
    }));
  }

  if (ctx.tool?.hook) {
    registrations.push(await ctx.tool.hook("execute.before", (event) => {
      const contract = readContract();
      if (!contract) return;
      const result = handleOpenCodeTool({
        tool: event.tool,
        sessionID: event.sessionID,
        callID: event.callID ?? `${event.sessionID}:tool`
      }, { args: event.input }, contract, permitStore);
      if (result.decision.outcome === "deny") throw new OpenCodeGuardDenial(result.decision);
    }));
  }

  return async () => {
    for (const registration of registrations.reverse()) await registration.dispose();
  };
};

export default AsYouMeantOpenCodePlugin;
// SPDX-License-Identifier: MPL-2.0
