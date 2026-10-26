import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { CAMINHOS_CONTROLE_AGENTE } from '@maestro/shared';

const execFileAsync = promisify(execFile);

/**
 * Atalho "Controle desta máquina" na área de trabalho: abre a tela de controle
 * no Edge em modo app (janela própria, sem barra de endereço). Recriado a cada
 * subida do agente, então chega às máquinas que só atualizam pelo painel e
 * acompanha uma troca de porta. Sem Edge, cai no navegador padrão.
 */
const SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$edge = @("${env:ProgramFiles(x86)}\\Microsoft\\Edge\\Application\\msedge.exe", "$env:ProgramFiles\\Microsoft\\Edge\\Application\\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1',
  // GetFolderPath acompanha a área de trabalho redirecionada pelo OneDrive.
  "$caminho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Controle desta máquina.lnk'",
  '$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut($caminho)',
  'if ($edge) { $atalho.TargetPath = $edge; $atalho.Arguments = "--app=$env:MAESTRO_URL_CONTROLE"; $atalho.IconLocation = "$edge,0" }',
  'else { $atalho.TargetPath = $env:MAESTRO_URL_CONTROLE }',
  "$atalho.Description = 'QR code do controle de slides e NDI desta máquina'",
  '$atalho.Save()',
].join('; ');
const SCRIPT_CODIFICADO = Buffer.from(SCRIPT, 'utf16le').toString('base64');

export async function criarAtalhoControle(porta: number): Promise<void> {
  if (platform() !== 'win32') return;
  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', SCRIPT_CODIFICADO],
      {
        windowsHide: true,
        timeout: 20_000,
        env: { ...process.env, MAESTRO_URL_CONTROLE: `http://localhost:${porta}${CAMINHOS_CONTROLE_AGENTE.pagina}` },
      },
    );
  } catch (err) {
    // Sem atalho a tela continua no endereço; não é motivo para derrubar o agente.
    console.warn('[agente] não consegui criar o atalho do controle:', err instanceof Error ? err.message : err);
  }
}
