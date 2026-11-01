import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Abre um endereço no Chrome; sem Chrome instalado, cai no navegador padrão.
 * O endereço vai por variável de ambiente, nunca montado dentro do comando:
 * um "&" ou aspas na URL não viram comando.
 */
const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'try { Start-Process chrome -ArgumentList $env:MAESTRO_URL }',
  'catch { Start-Process $env:MAESTRO_URL }',
].join('; ');
const SCRIPT_CODIFICADO = Buffer.from(SCRIPT, 'utf16le').toString('base64');

/**
 * O `Start-Process -ArgumentList` junta os argumentos num texto só: um espaço ou
 * aspas na URL virariam mais um argumento do Chrome. `href` os devolve codificados.
 */
export function urlSegura(url: string): string {
  if (!/^https?:\/\//i.test(url) || !URL.canParse(url)) throw new Error('Só endereços http:// ou https:// podem ser abertos.');
  return new URL(url).href;
}

export async function abrirNoNavegador(endereco: string): Promise<void> {
  const url = urlSegura(endereco);
  const env = { ...process.env, MAESTRO_URL: url };
  if (platform() === 'win32') {
    await execFileAsync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', SCRIPT_CODIFICADO], {
      windowsHide: true,
      timeout: 20_000,
      env,
    });
    return;
  }
  if (platform() === 'darwin') {
    await execFileAsync('open', ['-a', 'Google Chrome', url]).catch(() => execFileAsync('open', [url]));
    return;
  }
  await execFileAsync('xdg-open', [url]);
}
