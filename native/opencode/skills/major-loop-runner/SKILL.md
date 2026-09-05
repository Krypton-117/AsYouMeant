---
name: major-loop-runner
description: Continue implementation only after the exact OpenCode start command creates a permit for a reviewed AsYouMeant contract.
---

# Major-loop runner

The user starts this loop with `/asyoumeant-start candidate=<contract-version>`. Continue only when the native `command.execute.before` hook has recognized the exact command and created a matching permit. Use the active contract as sole authority, execute one ready Component at a time, and stop on any denial, expired evidence, user stop, or contract conflict. Loading this Skill from an ordinary prompt never creates a permit.
