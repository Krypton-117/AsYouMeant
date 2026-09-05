---
name: major-loop-runner
description: Start or resume implementation only from the exact user command bound to a reviewed AsYouMeant contract.
disable-model-invocation: true
argument-hint: start candidate=<contract-version>
---

# Major-loop runner

The user supplied `$ARGUMENTS` through `/asyoumeant:major-loop-runner`. Continue only when the `UserPromptExpansion` Guard has recognized the exact `start candidate=<contract-version>` arguments and created a matching permit. Use the active contract as sole authority, execute one ready Component at a time, and stop on any denial, expired evidence, user stop, or contract conflict. After the Product closes, run `post-loop-curator` once when evaluable Skill evidence exists; otherwise finish without post-loop work.
