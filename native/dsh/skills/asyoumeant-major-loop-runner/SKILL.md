---
name: asyoumeant-major-loop-runner
description: Use when the user explicitly starts or resumes a DSH task governed by a reviewed AsYouMeant contract.
disable-model-invocation: true
user-invocable: true
license: MPL-2.0
---

# AsYouMeant major-loop runner

Use the active AsYouMeant contract as the sole authority. First call `asyoumeant_selfcheck`; continue only when it reports an active permit for the requested candidate. Execute only the current ready Component and its contracted checks. Stop on denial, expired evidence, user stop, or contract conflict. Do not add work, tests, dependencies, delegation, delivery, or cleanup that the contract does not authorize. After the Product closes, run `post-loop-curator` once when evaluable Skill evidence exists; otherwise finish without post-loop work.
