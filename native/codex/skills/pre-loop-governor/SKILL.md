---
name: pre-loop-governor
description: Prepare an AsYouMeant development contract through detailed intent discussion before implementation begins.
---

# Pre-loop governor

Discuss the actual user, problem, outcome, scope and acceptance criteria before implementation. Explain choices in ordinary language. Ordinary tasks need no AYM workflow.

For the native first-task route in this development checkout, the user enters `$pre-loop-governor prepare`. Check the Hook response: it creates an unreviewed `.asyoumeant/draft.json` and authorizes only the author session to edit that file. This route supports one requested file-change work item with user-visible acceptance, not installation, tests/services, delegation or external writes.

Fill `intent.problem`, `intent.outcome`, `intent.acceptanceCriteria`, `candidateVersion`, `activeWorkItemId`, `actionBasis.requirementIds` and `policy.allowedPaths` from the confirmed discussion. Use explicit project files or directory scopes such as `src/login.ts` or `src/**`. Preserve other permission defaults. Product release version and candidate version are different. Use dedicated edit/apply_patch tools; arbitrary shell wrappers have unproven effects.

Once the draft accurately reflects the discussion, present its scope and the exact `$pre-loop-governor freeze candidate=<draft-version>` for the user. A successful freeze creates `contract.json` and `review-request.md`; the frozen contract becomes authority and draft writes stop.

Independent review takes place in a different native Codex session in the same project, in `AYM mode research`. That reviewer reads the frozen contract and relevant files and gives an evidence-backed pass/fail for intent, permission, technical feasibility and internal consistency. Present the exact review command specified in `review-request.md` with the reviewer's actual findings, for the user to inspect and submit in that reviewer session. A failed dimension rejects the candidate. The command records a user attestation of independent review; it does not perform a model review or prove that conclusions are correct. Never fabricate findings or mark review passed by editing a file.

After a passed review, direct the user back to the author session for `$major-loop-runner start candidate=<reviewed-version>`. Only the Hook's ACTIVE response establishes a permit. Revisions return through prepare/freeze/review; `AYM mode ordinary` exits and invalidates the session permit.

For existing externally prepared full-tree contracts, retain their documented projection and independent-review process. Do not treat the narrow first-task route as the full recursive runner or claim unverified host support.
