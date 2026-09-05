---
name: diagnostic-kernel
description: Diagnose a contracted failure with one evidence-bound, discriminating probe and a fixed retry budget.
disable-model-invocation: false
user-invocable: true
---

# Diagnostic kernel

Require an existing failure record, competing hypotheses, and a probe whose outcomes distinguish them. Run one probe for the current hypothesis identity. Repair only a confirmed defect. Do not repeat the same path without new evidence, an invalidated environment, or a changed implementation; stop with an exact conflict report when the budget is exhausted.
