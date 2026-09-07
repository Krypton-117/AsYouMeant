import { unreviewedContract, requestedMode } from "../asyoumeant-runtime/dist/src/guard/session.js";
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
  openCodeSkillIsInPool
} from "../asyoumeant-runtime/dist/src/hosts/skill-pool.js";

function contractFile(directory) {
  return process.env.ASYOUMEANT_CONTRACT_PATH || join(directory, ".asyoumeant", "contract.json");
}

function readContractAt(path) {
  if (!existsSync(path)) return unreviewedContract("opencode", "opencode-command-transform");
  return JSON.parse(readFileSync(path, "utf8"));
}

async function AsYouMeantOpenCodePlugin({ directory }) {
  const contractPath = contractFile(directory);
  const stateRoot = process.env.ASYOUMEANT_STATE_DIR || join(directory, ".asyoumeant", "opencode-state");
  const evidencePath = join(stateRoot, "plugin-loaded.json");
  const permitStore = new FileOpenCodePermitStore(join(stateRoot, "permits"));

  const readContract = () => readContractAt(contractPath);

  const loadRuntime = () => {
    const contract = readContract();
    if (!contract) return null;
    return createOpenCodeHooks(contract, permitStore);
  };

  return {
    "chat.message": async (input, output) => {
      if (output.message?.role !== "user") return;
      const text = output.parts.filter((part) => part.type === "text" && !part.synthetic).map((part) => part.text).join("\n");
      const mode = requestedMode(text);
      if (mode && input.sessionID) permitStore.setMode(input.sessionID, mode);
    },
    config: async (config) => {
      registerOpenCodeCommand(config);
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
      if (input.command === "asyoumeant-mode") {
        handleOpenCodeCommand(input, unreviewedContract("opencode", "opencode-command-transform"), permitStore);
        return;
      }
      if (input.command !== "asyoumeant-start") return;
      const hooks = loadRuntime();
      if (hooks) await hooks["command.execute.before"]?.(input, output);
    },
    "tool.execute.before": async (input, output) => {
      if (permitStore.mode(input.sessionID) === "ordinary") return;
      const contract = readContract();
      const skillId = input.tool === "skill"
        ? String(output?.args?.name ?? output?.args?.skill ?? output?.args?.id ?? "")
        : "";
      if (permitStore.mode(input.sessionID) === "aym" && skillId && contract?.skillPool && !openCodeSkillIsInPool(contract.skillPool, skillId)) {
        throw new Error(`[SKILL_OUT_OF_POOL] Action skill ${skillId}; mode=aym. Skill permission is absent. Revise pre-loop and independent review, then use /asyoumeant-start candidate=${contract.candidateVersion}. Read-only tools remain available; switch with /asyoumeant-mode research or /asyoumeant-mode ordinary.`);
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
        name: "asyoumeant-mode",
        description: "Set ordinary, research or aym mode for this session",
        async execute({ sessionID, prompt }) {
          handleOpenCodeCommand({ command: "asyoumeant-mode", sessionID, arguments: String(prompt?.text ?? "").trim() }, unreviewedContract("opencode", "opencode-command-transform"), permitStore);
        }
      });
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

  if (ctx.tool?.hook) {
    registrations.push(await ctx.tool.hook("execute.before", (event) => {
      if (permitStore.mode(event.sessionID) === "ordinary") return;
      const contract = readContract();
      if (!contract) return;
      const requested = event.tool === "skill" ? String(event.input?.name ?? event.input?.skill ?? "") : "";
      if (permitStore.mode(event.sessionID) === "aym" && requested && contract.skillPool && !openCodeSkillIsInPool(contract.skillPool, requested)) {
        throw new Error(`Action skill ${requested}; mode=aym. Skill is outside the approved pool. Revise pre-loop or send /asyoumeant-mode ordinary. Read-only tools remain available.`);
      }
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
