// SPDX-License-Identifier: MPL-2.0
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('Codex native preparation creates an unreviewed draft in a clean project', () => {
  const root = mkdtempSync(join(tmpdir(), 'aym-first-task-'));
  try {
    const plugin = resolve('native/codex');
    const result = spawnSync(process.execPath, [join(plugin, 'hooks/asyoumeant-codex.cjs')], {
      input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'author', cwd: root, prompt: '$pre-loop-governor prepare' }),
      encoding: 'utf8',
      env: { ...process.env, PLUGIN_ROOT: plugin, CODEX_HOME: join(root, 'host'), ASYOUMEANT_STATE_DIR: join(root, 'host/state'), ASYOUMEANT_CONTRACT_PATH: join(root, '.asyoumeant/contract.json') }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(root, '.asyoumeant/draft.json')), true, `Native pre-loop has no draft creation path: ${result.stdout} ${result.stderr}`);
    assert.equal(existsSync(join(root, '.asyoumeant/contract.json')), false, 'Preparation must not create reviewed authority');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function project(run) {
  const root = mkdtempSync(join(tmpdir(), 'aym-first-flow-'));
  const plugin = resolve('native/codex');
  const hook = (session, input) => {
    const result = spawnSync(process.execPath, [join(plugin, 'hooks/asyoumeant-codex.cjs')], {
      input: JSON.stringify({ session_id: session, cwd: root, ...input }), encoding: 'utf8',
      env: { ...process.env, PLUGIN_ROOT: plugin, CODEX_HOME: join(root, 'host'), ASYOUMEANT_STATE_DIR: join(root, 'host/state'), ASYOUMEANT_CONTRACT_PATH: join(root, '.asyoumeant/contract.json') }
    });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput : {};
  };
  const prompt = (session, text) => hook(session, { hook_event_name: 'UserPromptSubmit', prompt: text });
  const tool = (session, name, input) => hook(session, { hook_event_name: 'PreToolUse', tool_name: name, tool_input: input });
  const draftPath = join(root, '.asyoumeant/draft.json');
  const fill = () => {
    const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
    draft.candidateVersion = 'login-v1';
    draft.activeWorkItemId = 'login';
    draft.actionBasis.requirementIds = ['user-login'];
    draft.policy.allowedPaths = ['src/login.ts'];
    draft.intent = { problem: 'Login rejects the existing valid input', outcome: 'Accept that input without touching billing', acceptanceCriteria: ['User confirms the example logs in'] };
    const permission = tool('author', 'apply_patch', `*** Begin Patch\n*** Update File: .asyoumeant/draft.json\n@@\n-old\n+new\n*** End Patch`);
    assert.notEqual(permission.permissionDecision, 'deny', JSON.stringify(permission));
    writeFileSync(draftPath, JSON.stringify(draft));
    return draft;
  };
  const frozen = () => {
    const result = prompt('author', '$pre-loop-governor freeze candidate=login-v1');
    assert.match(result.additionalContext, /Frozen login-v1/);
    return JSON.parse(readFileSync(join(root, '.asyoumeant/contract.json'), 'utf8'));
  };
  const reviewCommand = (contract, pass = true) => `$pre-loop-governor review candidate=${contract.candidateVersion} projection=${contract.projectionIdentity} findings=${JSON.stringify(Object.fromEntries(['intent', 'permission', 'technical', 'internal'].map(axis => [axis, { pass, evidence: `Test review attestation for ${axis}; not an authenticated model run` }])) )}`;
  try { run({ root, prompt, tool, fill, frozen, reviewCommand, draftPath }); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

test('Codex first-task chain enforces independent review, exact native start, scope and exit', () => project(({ root, prompt, tool, fill, frozen, reviewCommand }) => {
  assert.deepEqual(tool('ordinary', 'write', { path: 'anything.ts' }), {});
  prompt('author', '$pre-loop-governor prepare');
  assert.match(prompt('author', '$pre-loop-governor freeze candidate=login-v1').additionalContext, /blocked/);
  assert.equal(tool('author', 'write', { path: 'src/login.ts' }).permissionDecision, 'deny');
  assert.equal(tool('author', 'write', { path: '.asyoumeant/contract.json' }).permissionDecision, 'deny');
  fill();
  const contract = frozen();
  assert.equal(contract.review.result, 'PRE_LOOP_REVIEW_FAILED');
  assert.equal(tool('author', 'write', { path: '.asyoumeant/draft.json' }).permissionDecision, 'deny');
  assert.match(prompt('author', '$major-loop-runner start candidate=login-v1').additionalContext, /independent review passes/);
  assert.match(prompt('author', reviewCommand(contract)).additionalContext, /different native session/);
  assert.match(prompt('reviewer', reviewCommand(contract).replace(contract.projectionIdentity, 'stale')).additionalContext, /current frozen candidate/);
  assert.match(prompt('reviewer', reviewCommand(contract)).additionalContext, /PRE_LOOP_REVIEW_PASSED/);
  assert.equal(tool('reviewer', 'write', { path: 'src/login.ts' }).permissionDecision, 'deny');
  assert.match(prompt('reviewer', '$major-loop-runner start candidate=login-v1').additionalContext, /Only the author/);
  assert.equal(tool('author', 'write', { path: 'src/login.ts' }).permissionDecision, 'deny');
  prompt('author', '$major-loop-runner start candidate=wrong');
  assert.equal(tool('author', 'write', { path: 'src/login.ts' }).permissionDecision, 'deny');
  assert.match(prompt('author', '$major-loop-runner start candidate=login-v1').additionalContext, /permit ACTIVE/);
  assert.deepEqual(tool('author', 'apply_patch', '*** Begin Patch\n*** Update File: src/login.ts\n@@\n-old\n+new\n*** End Patch'), {});
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/login.ts'), 'approved implementation output\n');
  assert.equal(readFileSync(join(root, 'src/login.ts'), 'utf8'), 'approved implementation output\n');
  assert.equal(tool('author', 'apply_patch', '*** Begin Patch\n*** Update File: src/login.ts\n*** Move to: src/billing.ts\n@@\n-old\n+new\n*** End Patch').permissionDecision, 'deny');
  for (const [name, input] of [['write', { path: 'src/billing.ts' }], ['exec_command', { cmd: 'npm install extra' }], ['exec_command', { cmd: 'git push' }], ['send_message', {}]]) {
    assert.equal(tool('author', name, input).permissionDecision, 'deny');
  }
  const changed = { ...contract, review: { ...contract.review, result: 'PRE_LOOP_REVIEW_PASSED' }, policy: { ...contract.policy, allowedPaths: ['**'] } };
  writeFileSync(join(root, '.asyoumeant/contract.json'), JSON.stringify(changed));
  assert.match(tool('author', 'write', { path: 'src/login.ts' }).permissionDecisionReason, /Frozen authority changed/);
  assert.deepEqual(tool('reviewer', 'read_file', { path: 'src/login.ts' }), {});
  assert.equal(tool('reviewer', 'write', { path: 'src/login.ts' }).permissionDecision, 'deny');
  prompt('author', 'AYM mode ordinary');
  assert.deepEqual(tool('author', 'write', { path: 'src/billing.ts' }), {});
  prompt('author', 'AYM mode aym');
  assert.equal(tool('author', 'write', { path: 'src/login.ts' }).permissionDecision, 'deny');
}));

test('Codex old author permit cannot revive after another session re-prepares identical scope', () => project(({ prompt, tool, fill, frozen, reviewCommand }) => {
  prompt('author', '$pre-loop-governor prepare');
  fill();
  const original = frozen();
  prompt('reviewer', reviewCommand(original));
  prompt('author', '$major-loop-runner start candidate=login-v1');
  assert.deepEqual(tool('author', 'write', { path: 'src/login.ts' }), {});
  prompt('new-author', '$pre-loop-governor prepare');
  const result = prompt('new-author', '$pre-loop-governor freeze candidate=login-v1');
  const projection = /Projection=(\S+)\.$/.exec(result.additionalContext)[1];
  assert.notEqual(projection, original.projectionIdentity);
  prompt('reviewer', reviewCommand({ ...original, projectionIdentity: projection }));
  assert.equal(tool('author', 'write', { path: 'src/login.ts' }).permissionDecision, 'deny');
  prompt('new-author', '$major-loop-runner start candidate=login-v1');
  assert.deepEqual(tool('new-author', 'write', { path: 'src/login.ts' }), {});
}));

test('Codex draft exception cannot write another target, cross review sessions, or follow a junction', () => project(({ root, prompt, tool, fill, frozen, reviewCommand }) => {
  prompt('author', '$pre-loop-governor prepare');
  prompt('reviewer', 'AYM mode research');
  assert.equal(tool('reviewer', 'write', { path: '.asyoumeant/draft.json' }).permissionDecision, 'deny');
  assert.equal(tool('author', 'apply_patch', '*** Begin Patch\n*** Update File: .asyoumeant/draft.json\n*** Move to: src/escape.ts\n@@\n-x\n+y\n*** End Patch').permissionDecision, 'deny');
  fill();
  const contract = frozen();
  assert.match(prompt('reviewer', reviewCommand(contract).replace(/findings=.*/, 'findings={}')).additionalContext, /four explicit/);
  assert.match(prompt('reviewer', reviewCommand(contract, false)).additionalContext, /PRE_LOOP_REVIEW_FAILED/);
  assert.match(prompt('author', '$major-loop-runner start candidate=login-v1').additionalContext, /independent review passes/);
  prompt('author', '$pre-loop-governor prepare');
  fill();
  const next = frozen();
  assert.notEqual(next.projectionIdentity, contract.projectionIdentity, 'Re-freezing identical content must invalidate old review and permit bindings');
  assert.match(prompt('reviewer', reviewCommand(contract)).additionalContext, /current frozen candidate/);
  prompt('reviewer', reviewCommand(next));
  prompt('author', '$major-loop-runner start candidate=login-v1');
  mkdirSync(join(root, 'src'));
  symlinkSync(join(root, '.asyoumeant'), join(root, 'src/linked'), 'junction');
  assert.match(tool('author', 'write', { path: 'src/linked/contract.json' }).permissionDecisionReason, /links|junctions/);
}));
