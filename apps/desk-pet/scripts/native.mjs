import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withCargoPath } from './rust-env.mjs';

const [tool, ...args] = process.argv.slice(2);
if (tool !== 'tauri' && tool !== 'cargo') {
  console.error('Aufruf: node scripts/native.mjs <tauri|cargo> [Argumente]');
  process.exit(1);
}

const command = tool === 'tauri' ? process.execPath : 'cargo';
const commandArgs = tool === 'tauri'
  ? [fileURLToPath(new URL('../node_modules/@tauri-apps/cli/tauri.js', import.meta.url)), ...args]
  : args;

const child = spawn(command, commandArgs, {
  env: withCargoPath(process.env),
  stdio: 'inherit',
});
child.on('error', (error) => {
  console.error(`${tool} konnte nicht gestartet werden: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
