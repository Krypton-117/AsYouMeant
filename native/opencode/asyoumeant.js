import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  FileOpenCodePermitStore,
  createOpenCodeHooks,
  registerOpenCodeCommand
} from "../asyoumeant-runtime/dist/src/hosts/opencode/adapter.js";

export default async function AsYouMeantOpenCodePlugin({ directory }) {
  const contractPath = process.env.ASYOUMEANT_CONTRACT_PATH || join(directory, ".asyoumeant", "contract.json");
  const stateRoot = process.env.ASYOUMEANT_STATE_DIR || join(directory, ".asyoumeant", "opencode-state");
  const evidencePath = join(stateRoot, "plugin-loaded.json");
  let runtime = null;

  const loadRuntime = () => {
    if (runtime) return runtime;
    if (!existsSync(contractPath)) return null;
    const contract = JSON.parse(readFileSync(contractPath, "utf8"));
    runtime = createOpenCodeHooks(contract, new FileOpenCodePermitStore(join(stateRoot, "permits")));
    return runtime;
  };

  return {
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
      const hooks = loadRuntime();
      if (hooks) await hooks["command.execute.before"]?.(input, output);
    },
    "tool.execute.before": async (input, output) => {
      const hooks = loadRuntime();
      if (hooks) await hooks["tool.execute.before"]?.(input, output);
    }
  };
}
