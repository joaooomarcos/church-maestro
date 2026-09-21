/**
 * Roda a atualização na hora, sem esperar o próximo logon.
 * Usa o atualizador do sistema certo: PowerShell no Windows, bash no Linux.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scripts = dirname(fileURLToPath(import.meta.url));
const ehWindows = process.platform === 'win32';

const { status } = ehWindows
  ? spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', resolve(scripts, 'atualizar.ps1'), '-Forcar'],
      { stdio: 'inherit' },
    )
  : spawnSync('bash', [resolve(scripts, 'atualizar.sh'), '--forcar'], { stdio: 'inherit' });

process.exit(status ?? 1);
