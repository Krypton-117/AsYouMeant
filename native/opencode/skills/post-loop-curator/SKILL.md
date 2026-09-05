---
name: post-loop-curator
description: Use when an AsYouMeant Product has closed and the task has evaluable evidence from Skills used during the task.
slash: false
metadata:
  opencode/slash: false
---

# Post-loop curator

Run only after the Product is accepted and closed. Evaluate every Skill actually used in pre-loop, major-loop, or diagnostics. Record evidence-backed task types, impact, fit, misfit, improvement ideas, and meaningful same-class differences in the shared advisory `~/.asyoumeant/skill-experience.md`. Update it only when evidence changes a conclusion. Carry this curator's own evaluation to the next post-loop instead of evaluating it recursively. Exit task-bound Skills whose consumers have closed; retain their files.

Do not change the delivered Product, reopen acceptance, install dependencies, merge Skills, grant authority to the experience document, or block delivery. If there is no evaluable Skill evidence, finish without writing.
