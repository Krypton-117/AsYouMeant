// SPDX-License-Identifier: MPL-2.0
import { createHash, randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Guard } from "../../guard/guard.js";
import { unreviewedContract } from "../../guard/session.js";
import { reviewGate } from "../../conformance/reviewer.js";
import { codexWriteTargets } from "./adapter.js";
const axes = ["intent", "permission", "technical", "internal"];
function canonical(value) {
    if (Array.isArray(value))
        return value.map(canonical);
    if (value && typeof value === "object")
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    return value;
}
const digest = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    renameSync(temporary, path);
}
function assertPlain(path) {
    // Reject links/junctions in every existing ancestor before privileged control-plane writes.
    for (let current = resolve(path);; current = dirname(current)) {
        try {
            if (lstatSync(current).isSymbolicLink())
                throw new Error("Preparation paths must not contain symbolic links or junctions.");
        }
        catch (error) {
            if (error.code !== "ENOENT")
                throw error;
        }
        if (dirname(current) === current)
            break;
    }
}
function message(input, text, denied = false) {
    return { handled: true, output: { hookSpecificOutput: input.hook_event_name === "PreToolUse"
                ? { hookEventName: "PreToolUse", ...(denied ? { permissionDecision: "deny", permissionDecisionReason: text } : { additionalContext: text }) }
                : { hookEventName: "UserPromptSubmit", additionalContext: text } } };
}
function validatedDraft(value, candidate) {
    const draft = value;
    if (!draft || draft.candidateVersion !== candidate || candidate === "unreviewed")
        throw new Error("The command candidate must match the completed draft candidateVersion.");
    if (!draft.intent || !nonempty(draft.intent.problem) || !nonempty(draft.intent.outcome)
        || !Array.isArray(draft.intent.acceptanceCriteria) || !draft.intent.acceptanceCriteria.length || !draft.intent.acceptanceCriteria.every(nonempty)) {
        throw new Error("Fill the actual problem, outcome and acceptance criteria before freezing.");
    }
    if (!nonempty(draft.activeWorkItemId) || draft.activeWorkItemId === "pre-loop" || draft.actionBasis?.kind !== "requested"
        || !draft.actionBasis.requirementIds.length || !draft.actionBasis.requirementIds.every(nonempty))
        throw new Error("Name the requested work item and requirement IDs.");
    const paths = draft.policy?.allowedPaths;
    if (!Array.isArray(paths) || !paths.length || !paths.every(path => typeof path === "string"
        && /^[a-zA-Z0-9_-][a-zA-Z0-9_./-]*$/.test(path.replace(/\/\*\*$/, ""))
        && !path.includes("..") && !path.startsWith("/") && !path.split("/").some(part => part.startsWith(".")))) {
        throw new Error("Use explicit project file paths or directory/** scopes; control directories, traversal and global wildcards are excluded.");
    }
    // First-task support is deliberately narrow: file changes with user-visible acceptance.
    const base = unreviewedContract("codex", "codex-user-prompt-submit");
    const contract = {
        ...base, candidateVersion: candidate, projectionIdentity: "pending",
        intent: structuredClone(draft.intent), activeWorkItemId: draft.activeWorkItemId,
        actionBasis: { kind: "requested", requirementIds: [...draft.actionBasis.requirementIds] },
        policy: { ...base.policy, allowedPaths: [...paths], allowedWorkItemIds: [draft.activeWorkItemId] },
        nativeStartPaths: [{ host: "codex", sourceKind: "codex-user-prompt-submit", command: `$major-loop-runner start candidate=${candidate}` }]
    };
    // Do not silently discard an author's requested authority or present it as reviewed.
    if (digest({ ...draft.policy, allowedPaths: [], allowedWorkItemIds: [] }) !== digest({ ...contract.policy, allowedPaths: [], allowedWorkItemIds: [] })) {
        throw new Error("This first-task route supports file changes only. Keep dependency, network, tests, delegation and external-effect permissions at their unreviewed defaults.");
    }
    // Every freeze is a new authority generation, even when the draft is unchanged.
    contract.projectionIdentity = `codex-preparation:${digest(contract)}:${randomUUID()}`;
    contract.review = { result: "PRE_LOOP_REVIEW_FAILED", candidateVersion: candidate, projectionIdentity: contract.projectionIdentity };
    new Guard(contract);
    return contract;
}
/** Native user events own control-plane artifacts; tools may edit only the author's unfrozen draft. */
export function handleCodexPreparation(input, options) {
    const workspace = resolve(input.cwd || process.cwd());
    const directory = join(workspace, ".asyoumeant");
    const draftPath = join(directory, "draft.json");
    const statePath = join(options.stateRoot, `preparation-${digest(workspace)}.json`);
    const session = input.session_id || "";
    const prompt = input.prompt || "";
    const command = input.hook_event_name === "UserPromptSubmit" && prompt.startsWith("$pre-loop-governor ");
    const starting = input.hook_event_name === "UserPromptSubmit" && prompt.startsWith("$major-loop-runner start ");
    if (!command && !existsSync(statePath))
        return { handled: false };
    if (!command && !starting && options.store.mode(session) === "ordinary")
        return { handled: false };
    if (!command && !starting && options.store.mode(session) === "research") {
        return { handled: false, contract: unreviewedContract("codex", "codex-user-prompt-submit") };
    }
    try {
        if (!session)
            throw new Error("A native session identity is required.");
        assertPlain(directory);
        assertPlain(statePath);
        for (const file of [draftPath, options.contractPath, join(directory, "review-request.md"), join(directory, "review.json")])
            assertPlain(file);
        let state = existsSync(statePath) ? readJson(statePath) : null;
        if (command) {
            if (resolve(options.contractPath) !== join(directory, "contract.json"))
                throw new Error("Native preparation uses the current project's .asyoumeant/contract.json; remove a custom contract-path override for this route.");
            if (prompt === "$pre-loop-governor prepare") {
                if (state?.stage === "draft" && state.authorSession !== session)
                    throw new Error("Another session owns this draft; return to that session to prepare it.");
                options.store.setMode(session, "aym");
                if (!existsSync(draftPath))
                    writeJson(draftPath, {
                        ...unreviewedContract("codex", "codex-user-prompt-submit"),
                        intent: { problem: "", outcome: "", acceptanceCriteria: [] }
                    });
                writeJson(statePath, { authorSession: session, stage: "draft", contract: null });
                return message(input, "AYM mode=aym, preparation active. Discuss the requested scope and edit only .asyoumeant/draft.json. Fill intent, candidateVersion, activeWorkItemId, actionBasis.requirementIds and policy.allowedPaths. No implementation permit exists. The user next enters $pre-loop-governor freeze candidate=<draft-version>. Send AYM mode ordinary to exit.");
            }
            if (!state)
                throw new Error("Start with $pre-loop-governor prepare in the author session.");
            const freeze = /^\$pre-loop-governor freeze candidate=([A-Za-z0-9][A-Za-z0-9._-]{0,79})$/.exec(prompt);
            if (freeze) {
                if (state.authorSession !== session || state.stage !== "draft")
                    throw new Error("Only the author session may freeze an active draft.");
                const contract = validatedDraft(readJson(draftPath), freeze[1]);
                options.store.setMode(session, "aym");
                state = { authorSession: session, stage: "frozen", contract };
                writeJson(statePath, state);
                writeJson(options.contractPath, contract);
                writeFileSync(join(directory, "review-request.md"), `# Independent review required\n\nCandidate: ${contract.candidateVersion}\nProjection: ${contract.projectionIdentity}\n\nOpen a separate Codex session in this project. Use AYM mode research. Read contract.json and the relevant project files, checking intent, permission, technical feasibility and internal consistency. Report evidence and pass/fail for EACH dimension. No model or structural validator can infer approval from an empty conflict list.\n\nAfter inspecting that independent report, the USER submits in the reviewer session:\n\n$pre-loop-governor review candidate=${contract.candidateVersion} projection=${contract.projectionIdentity} findings=<JSON>\n\nJSON has exactly intent, permission, technical, internal; each contains pass (boolean) and evidence (nonempty string). Failed checks reject this candidate. This command records the user's attestation of the independent review; it does not execute an independent model or prove the review's truth.\n`, "utf8");
                return message(input, `Frozen ${contract.candidateVersion}; no implementation permit. Open a separate review session and follow .asyoumeant/review-request.md. Draft writes are now locked. Projection=${contract.projectionIdentity}.`);
            }
            const review = /^\$pre-loop-governor review candidate=(\S+) projection=(\S+) findings=([\s\S]+)$/.exec(prompt);
            if (review) {
                if (session === state.authorSession)
                    throw new Error("Independent review must be recorded in a different native session from the author.");
                if (state.stage !== "frozen" || !state.contract || state.contract.candidateVersion !== review[1] || state.contract.projectionIdentity !== review[2])
                    throw new Error("Review must bind the current frozen candidate AND projection.");
                if (digest(readJson(options.contractPath)) !== digest(state.contract))
                    throw new Error("The frozen contract changed; prepare and freeze it again before review.");
                const findings = JSON.parse(review[3]);
                if (!findings || Object.keys(findings).length !== axes.length || !axes.every(axis => typeof findings[axis]?.pass === "boolean" && nonempty(findings[axis]?.evidence)))
                    throw new Error("Independent review requires four explicit pass/fail findings with evidence.");
                const conflicts = axes.filter(axis => !findings[axis].pass).map(axis => ({
                    dimension: axis, impact: "Candidate is not ready for implementation", affectedFunction: "first-task preparation",
                    candidateVersion: state.contract.candidateVersion, expected: `${axis} review passed`, observed: findings[axis].evidence,
                    evidence: findings[axis].evidence, responsibleParty: "Agent", minimalCorrection: "Revise the draft and obtain a new independent review", reviewScope: axis
                }));
                const result = reviewGate({ candidateVersion: state.contract.candidateVersion, projectionVersions: [state.contract.candidateVersion], conflicts });
                state.contract.review.result = result.status;
                state.stage = result.status === "PRE_LOOP_REVIEW_PASSED" ? "reviewed" : "rejected";
                state.reviewerSession = session;
                options.store.setMode(session, "research");
                writeJson(statePath, state);
                writeJson(options.contractPath, state.contract);
                writeJson(join(directory, "review.json"), { ...result, projectionIdentity: state.contract.projectionIdentity, authorSession: state.authorSession, reviewerSession: session, findings, source: "native-user-review-attestation" });
                return message(input, `${result.status}; reviewer stays in research mode; no permit was created. ${state.stage === "reviewed" ? `Return to the author session and enter $major-loop-runner start candidate=${state.contract.candidateVersion}.` : "Revise through $pre-loop-governor prepare in the author session."}`);
            }
            throw new Error("Unknown preparation command. Use prepare, freeze candidate=<version>, or the exact review command in review-request.md.");
        }
        if (!state)
            return { handled: false };
        if (starting && (session !== state.authorSession || state.stage !== "reviewed")) {
            throw new Error("Only the author session may start after independent review passes. Review is not an implementation permit.");
        }
        if (input.hook_event_name === "PreToolUse") {
            const name = String(input.tool_name || "").toLowerCase();
            const targets = codexWriteTargets(input.tool_input, workspace);
            const write = /^(write|edit|apply_patch|delete|move)$/.test(name);
            if (write)
                for (const target of targets)
                    assertPlain(resolve(workspace, target));
            if (write && targets.some(path => path.split("/").some(part => [".asyoumeant", ".git", ".codex", ".agents"].includes(part)))) {
                const draftOnly = state.stage === "draft" && session === state.authorSession && options.store.mode(session) === "aym"
                    && /^(write|edit|apply_patch)$/.test(name) && targets.length > 0 && targets.every(path => path === ".asyoumeant/draft.json");
                if (draftOnly)
                    return message(input, "AYM pre-loop draft write only; this does not authorize implementation or review.");
                return message(input, "Action blocked: AYM control files or host configuration; mode=aym/research. Only the author's unfrozen draft may be edited. Use native preparation commands; read-only inspection is available, or send AYM mode ordinary to exit.", true);
            }
        }
        if (state.contract && digest(readJson(options.contractPath)) !== digest(state.contract))
            throw new Error("Frozen authority changed. No old permit applies; prepare, freeze and review again.");
        return { handled: false, contract: state.contract ?? unreviewedContract("codex", "codex-user-prompt-submit") };
    }
    catch (error) {
        // Keep command errors actionable; the original user message is never evidence of success.
        return message(input, `AYM preparation blocked: ${error instanceof Error ? error.message : "Invalid preparation state"} No permit created. Read-only advice remains available; send AYM mode ordinary to exit.`, true);
    }
}
