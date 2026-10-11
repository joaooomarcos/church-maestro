import { spawn, type ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import { carregarConfigSeExistir, salvarConfig } from './config.js';

/**
 * "Manter ligado": enquanto estiver ativo, o Windows não entra em repouso nem
 * apaga a tela por inatividade. Quem segura isso é um PowerShell auxiliar que
 * pede ao sistema (SetThreadExecutionState) e fica parado: o pedido vale
 * enquanto o processo viver, e nada no plano de energia da máquina é alterado.
 * Fechar a tampa do notebook ou mandar desligar à mão continua valendo.
 */

// 0x80000003 = ES_CONTINUOUS + ES_SYSTEM_REQUIRED + ES_DISPLAY_REQUIRED.
// O ReadLine prende o auxiliar à vida do agente: se o agente cair, a entrada
// fecha, o auxiliar sai e a máquina volta a seguir o plano de energia normal.
const COMANDO = [
  "$t = Add-Type -PassThru -Name Energia -Namespace Maestro -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint esFlags);'",
  '[void]$t::SetThreadExecutionState([uint32]2147483651)',
  '[void][Console]::In.ReadLine()',
].join('; ');
// Em base64 (UTF-16), como o PowerShell pede: as aspas do comando não dependem
// de como o Windows monta a linha de comando.
const COMANDO_CODIFICADO = Buffer.from(COMANDO, 'utf16le').toString('base64');

const ESPERA_RELIGAR_MS = 5000;

let auxiliar: ChildProcess | undefined;
let desejado = false;
let religar: NodeJS.Timeout | undefined;

export function suportaManterLigado(): boolean {
  return platform() === 'win32';
}

/** O que o painel mostra: a escolha da equipe, não o estado do processo auxiliar. */
export function manterLigadoAtivo(): boolean {
  return desejado;
}

function subirAuxiliar(): void {
  if (auxiliar || !desejado) return;
  const processo = spawn(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', COMANDO_CODIFICADO],
    { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true },
  );
  auxiliar = processo;
  const aoSair = (): void => {
    if (auxiliar !== processo) return;
    auxiliar = undefined;
    // Caiu sozinho com a função ligada: sobe de novo, sem martelar.
    if (desejado && !religar) {
      religar = setTimeout(() => {
        religar = undefined;
        subirAuxiliar();
      }, ESPERA_RELIGAR_MS);
    }
  };
  processo.on('exit', aoSair);
  processo.on('error', (err) => {
    console.error('[agente] não consegui manter a máquina ligada:', err.message);
    aoSair();
  });
}

function derrubarAuxiliar(): void {
  if (religar) clearTimeout(religar);
  religar = undefined;
  const processo = auxiliar;
  auxiliar = undefined;
  if (!processo) return;
  processo.stdin?.end();
  processo.kill();
}

function aplicar(ligado: boolean): void {
  desejado = ligado;
  if (ligado) subirAuxiliar();
  else derrubarAuxiliar();
}

/** Na subida do agente: retoma a escolha gravada (ela sobrevive a reinício e a atualização). */
export function retomarManterLigado(ligado: boolean): void {
  if (suportaManterLigado()) aplicar(ligado);
}

/** Liga ou desliga e grava a escolha no agent.json. */
export async function definirManterLigado(ligado: boolean): Promise<boolean> {
  if (!suportaManterLigado()) {
    throw new Error('Manter ligado só funciona nas máquinas Windows.');
  }
  aplicar(ligado);
  // Relê o arquivo: a config em memória pode ter overrides de ambiente que não devem ser gravados.
  const salva = await carregarConfigSeExistir();
  if (salva) await salvarConfig({ ...salva, manterLigado: ligado });
  return desejado;
}

/** No encerramento do agente. Não mexe na escolha gravada. */
export function encerrarManterLigado(): void {
  derrubarAuxiliar();
}
