'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function readStdin(maxWaitMs = 1500) {
  return new Promise((resolve) => {
    let body = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(body);
    };
    const timer = setTimeout(finish, maxWaitMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { body += chunk; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    process.stdin.resume();
  });
}

(async () => {
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;
    const input = JSON.parse(raw);
    const pluginRoot = process.env.PLUGIN_ROOT;
    if (!pluginRoot) throw new Error('PLUGIN_ROOT is unavailable');
    const contractPath = process.env.ASYOUMEANT_CONTRACT_PATH ||
      path.join(String(input.cwd || process.cwd()), '.asyoumeant', 'contract.json');


    const stateRoot = process.env.ASYOUMEANT_STATE_DIR ||
      path.join(process.env.CODEX_HOME || path.dirname(contractPath), 'asyoumeant-state');
    const moduleUrl = pathToFileURL(path.join(pluginRoot, 'dist', 'src', 'hosts', 'codex', 'adapter.js')).href;
    const { FileCodexPermitStore, handleCodexHook } = await import(moduleUrl);
    const { unreviewedContract, requestedMode } = await import(pathToFileURL(path.join(pluginRoot, 'dist', 'src', 'guard', 'session.js')).href);
    const store = new FileCodexPermitStore(stateRoot);
    if (input.hook_event_name === 'UserPromptSubmit') {
      const mode = requestedMode(String(input.prompt || ''));
      if (mode && input.session_id) store.setMode(input.session_id, mode);
    }
    const starting = input.hook_event_name === 'UserPromptSubmit' && String(input.prompt || '').startsWith('$major-loop-runner start candidate=');
    if (!starting && store.mode(String(input.session_id || '')) === 'ordinary') return;
    const contract = fs.existsSync(contractPath) ? JSON.parse(fs.readFileSync(contractPath, 'utf8')) : unreviewedContract('codex', 'codex-user-prompt-submit');
    const result = handleCodexHook(input, contract, store);
    if (result.output) process.stdout.write(`${JSON.stringify(result.output)}\n`);
  } catch (error) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'AYM could not read mode or contract state. Tool execution is blocked because authority cannot be determined. Repair the session state or disable the plugin through the host plugin command; read-only advice in chat remains available. No permit was created.' } }) + '\n');
    const name = error && error.name ? error.name : 'HookError';
    process.stderr.write(`AsYouMeant hook could not evaluate session state: ${name}\n`);
  }
})();
// SPDX-License-Identifier: MPL-2.0
