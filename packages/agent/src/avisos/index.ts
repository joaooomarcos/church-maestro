import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { monitorSchema, type ComandoAviso, type Monitor } from '@maestro/shared';
import { ErroApp } from '../apps/index.js';

const execFileAsync = promisify(execFile);

/** Monitor muda pouco, mas muda: alguém liga o projetor depois do agente. */
const CACHE_MONITORES_MS = 2 * 60_000;
/** Se o PowerShell cair antes disto, a janela não abriu e vale avisar o painel. */
const ESPERA_FALHA_MS = 2500;

function localizarScript(): string {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [join(aqui, 'aviso.ps1'), join(aqui, '..', '..', 'src', 'avisos', 'aviso.ps1')];
  const encontrado = candidatos.find((caminho) => existsSync(caminho));
  if (!encontrado) {
    throw new ErroApp('O script de avisos não foi encontrado na instalação do agente.');
  }
  return encontrado;
}

function argumentosPowerShell(...extras: string[]): string[] {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', localizarScript(), ...extras];
}

let cacheMonitores: { ts: number; dados: Monitor[] } | undefined;
let buscaEmAndamento: Promise<void> | undefined;

async function buscarMonitores(): Promise<void> {
  try {
    const { stdout } = await execFileAsync('powershell.exe', argumentosPowerShell('-Acao', 'monitores'), {
      timeout: 15_000,
      windowsHide: true,
    });
    const linha = (stdout.trim().split(/\r?\n/).pop() ?? '').replace(/^﻿/, '');
    const resposta = JSON.parse(linha) as { ok?: boolean; dados?: unknown };
    const dados = monitorSchema.array().safeParse(resposta.dados);
    cacheMonitores = { ts: Date.now(), dados: dados.success ? dados.data : [] };
  } catch {
    // Sem a lista, o painel oferece só "principal" — o aviso continua funcionando.
    cacheMonitores = { ts: Date.now(), dados: [] };
  }
}

/**
 * Para o heartbeat: devolve o que já sabe sem esperar o PowerShell, e renova a
 * lista em segundo plano. Fora do Windows não há escolha de monitor.
 */
export function monitoresConhecidos(): Monitor[] | undefined {
  if (platform() !== 'win32') return undefined;
  const expirado = !cacheMonitores || Date.now() - cacheMonitores.ts >= CACHE_MONITORES_MS;
  if (expirado && !buscaEmAndamento) {
    buscaEmAndamento = buscarMonitores().finally(() => {
      buscaEmAndamento = undefined;
    });
  }
  return cacheMonitores?.dados;
}

/**
 * Abre a janela e responde assim que ela está de pé — não espera ninguém
 * clicar em "Ok". Só é erro se o PowerShell cair logo de cara.
 */
function mostrarNoWindows(comando: ComandoAviso): Promise<void> {
  const mensagemB64 = Buffer.from(comando.mensagem, 'utf8').toString('base64');
  const extras = ['-Acao', 'mostrar', '-MensagemB64', mensagemB64];
  if (comando.monitor) extras.push('-Monitor', comando.monitor);

  return new Promise((resolver, rejeitar) => {
    const filho = spawn('powershell.exe', ['-Sta', ...argumentosPowerShell(...extras)], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let saida = '';
    filho.stdout.on('data', (pedaco: Buffer) => {
      saida += pedaco.toString('utf8');
    });
    const timer = setTimeout(() => {
      // Continua de pé: a janela está na tela esperando o "Ok".
      filho.stdout.removeAllListeners('data');
      filho.stdout.resume();
      resolver();
    }, ESPERA_FALHA_MS);
    filho.on('error', (erro) => {
      clearTimeout(timer);
      rejeitar(new ErroApp('Não consegui abrir a janela de aviso nesta máquina.', erro.message));
    });
    filho.on('exit', (codigo) => {
      clearTimeout(timer);
      if (codigo === 0) {
        resolver();
        return;
      }
      rejeitar(new ErroApp('A janela de aviso não abriu nesta máquina.', saida.trim().slice(0, 300)));
    });
  });
}

async function mostrarNoLinux(comando: ComandoAviso): Promise<void> {
  try {
    // "critical" fica na tela até alguém fechar, como a janela do Windows.
    await execFileAsync('notify-send', ['-u', 'critical', '-a', 'Maestro', 'Maestro', comando.mensagem], {
      timeout: 5000,
    });
  } catch (erro) {
    throw new ErroApp(
      'Não consegui mostrar o aviso no Linux. Confira se o notify-send está instalado (pacote libnotify-bin).',
      erro instanceof Error ? erro.message : String(erro),
    );
  }
}

/** Só para desenvolver no Mac: notificação do sistema. */
async function mostrarNoMac(comando: ComandoAviso): Promise<void> {
  await execFileAsync('osascript', [
    '-e',
    'on run argv',
    '-e',
    'display notification (item 1 of argv) with title "Maestro"',
    '-e',
    'end run',
    comando.mensagem,
  ]);
}

export async function mostrarAviso(comando: ComandoAviso): Promise<void> {
  const so = platform();
  if (so === 'win32') return mostrarNoWindows(comando);
  if (so === 'darwin') return mostrarNoMac(comando);
  return mostrarNoLinux(comando);
}
