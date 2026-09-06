import type { SkillPool } from "../skills/pool.js";
import type { SkillExperienceStore } from "./experience-store.js";
// SPDX-License-Identifier: MPL-2.0

import type {
  PostLoopInput,
  PostLoopOutcome,
  SkillEvaluation
} from "./types.js";

const curatorSkillId = "post-loop-curator";

function cloneEvaluation(value: Readonly<SkillEvaluation>): SkillEvaluation {
  return structuredClone(value);
}

export class PostLoopCurator {
  readonly #store: SkillExperienceStore;
  readonly #pool: SkillPool;

  constructor(store: SkillExperienceStore, pool: SkillPool) {
    this.#store = store;
    this.#pool = pool;
  }

  async run(input: Readonly<PostLoopInput>): Promise<PostLoopOutcome> {
    if (input.productStatus !== "CLOSED") {
      throw new Error("Post-loop may run only after the Product is closed.");
    }
    const evaluations = [
      ...(input.carriedCuratorEvaluation ? [input.carriedCuratorEvaluation] : []),
      ...input.evaluations
    ].filter((evaluation) => evaluation.skillId !== curatorSkillId);
    const used = evaluations.filter((evaluation) => evaluation.used);
    const update = used.length > 0
      ? await this.#store.update(used)
      : { changed: false, document: await this.#store.read() };
    const exited = new Set<string>();
    for (const consumerId of [...new Set(input.closedConsumerIds)].sort()) {
      for (const skillId of this.#pool.exitConsumer(consumerId)) exited.add(skillId);
    }
    return {
      status: used.length === 0 ? "NO_EVIDENCE" : update.changed ? "UPDATED" : "UNCHANGED",
      document: update.document,
      exitedSkillIds: [...exited].sort(),
      deferredCuratorEvaluation: input.currentCuratorEvaluation
        ? cloneEvaluation(input.currentCuratorEvaluation)
        : null
    };
  }
}
