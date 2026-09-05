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
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (!pluginRoot) throw new Error('CLAUDE_PLUGIN_ROOT is unavailable');
    const contractPath = process.env.ASYOUMEANT_CONTRACT_PATH ||
      path.join(String(input.cwd || process.cwd()), '.asyoumeant', 'contract.json');
    if (!fs.existsSync(contractPath)) return;
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const stateRoot = process.env.CLAUDE_PLUGIN_DATA || path.join(path.dirname(contractPath), 'asyoumeant-claude-state');
    const moduleUrl = pathToFileURL(path.join(pluginRoot, 'dist', 'src', 'hosts', 'claude', 'adapter.js')).href;
    const { FileClaudePermitStore, handleClaudeHook } = await import(moduleUrl);
    const result = handleClaudeHook(input, contract, new FileClaudePermitStore(stateRoot));
    if (result.output) process.stdout.write(`${JSON.stringify(result.output)}\n`);
  } catch (error) {
    const name = error && error.name ? error.name : 'HookError';
    process.stderr.write(`AsYouMeant Claude hook failed open: ${name}\n`);
  }
})();
// SPDX-License-Identifier: MPL-2.0
