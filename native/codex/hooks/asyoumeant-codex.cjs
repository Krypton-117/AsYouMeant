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
    if (!fs.existsSync(contractPath)) return;
    const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    const stateRoot = process.env.ASYOUMEANT_STATE_DIR ||
      path.join(process.env.CODEX_HOME || path.dirname(contractPath), 'asyoumeant-state');
    const moduleUrl = pathToFileURL(path.join(pluginRoot, 'dist', 'src', 'hosts', 'codex', 'adapter.js')).href;
    const { FileCodexPermitStore, handleCodexHook } = await import(moduleUrl);
    const result = handleCodexHook(input, contract, new FileCodexPermitStore(stateRoot));
    if (result.output) process.stdout.write(`${JSON.stringify(result.output)}\n`);
  } catch (error) {
    const name = error && error.name ? error.name : 'HookError';
    process.stderr.write(`AsYouMeant Codex hook failed open: ${name}\n`);
  }
})();
