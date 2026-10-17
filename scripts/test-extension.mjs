import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const executable = process.env.VSCODE_EXECUTABLE || (process.platform === 'darwin' ? '/Applications/Visual Studio Code.app/Contents/MacOS/Code' : 'code');
const data = await mkdtemp(join(tmpdir(), 'mermaid-viewer-vscode-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
try {
  const child = spawn(executable, [
    `--extensionDevelopmentPath=${resolve('.')}`, `--extensionTestsPath=${resolve('tests/extension-host.cjs')}`,
    `--user-data-dir=${data}`, `--extensions-dir=${join(data, 'extensions')}`,
    '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes',
  ], { env, stdio: 'inherit' });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve(code ?? 1)); });
} finally { await rm(data, { recursive: true, force: true }); }
