---
name: major-loop-runner
description: Start or resume implementation only from the exact user command bound to a reviewed AsYouMeant contract. Never infer authorization from ordinary prompts.
---

# Major-loop runner

Use the active contract as the sole authority. Start only when the Codex `UserPromptSubmit` Guard has recognized the exact command `$major-loop-runner start candidate=<contract-version>` and created a matching permit. Execute one ready Component at a time, preserve checkpoints, and stop on any Guard denial, expired evidence, user stop, or contract conflict. Do not add uncontracted work, tests, dependencies, delegation, delivery, or cleanup.
