import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { capturaMonitorSchema, type CapturaMonitor } from '@maestro/shared';
import { ErroApp } from '../apps/index.js';

const execFileAsync = promisify(execFile);

function localizarScript(): string {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [join(aqui, 'captura.ps1'), join(aqui, '..', '..', 'src', 'captura', 'captura.ps1')];
  const encontrado = candidatos.find((caminho) => existsSync(caminho));
  if (!encontrado) {
    throw new ErroApp('O script de captura não foi encontrado na instalação do agente.');
  }
  return encontrado;
}

/**
 * Tira um print do monitor e devolve a miniatura (JPEG, base64) e a amostra em
 * cinza. A imagem existe só na memória: o PowerShell escreve o resultado na
 * saída padrão e nada é gravado em disco. Sem `monitor`, vale o principal.
 */
export async function capturarMonitor(monitor: string | null | undefined): Promise<CapturaMonitor> {
  if (platform() !== 'win32') {
    throw new ErroApp('A captura de tela só funciona em máquinas Windows.');
  }
  const argumentos = [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    localizarScript(),
    ...(monitor ? ['-Monitor', monitor] : []),
  ];

  let saida: string;
  try {
    const resultado = await execFileAsync('powershell.exe', argumentos, {
      timeout: 20_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    saida = resultado.stdout;
  } catch (erro) {
    // O script escreve o motivo em JSON antes de sair com erro.
    const parcial = (erro as { stdout?: string }).stdout ?? '';
    throw new ErroApp(
      'Não consegui capturar a tela desta máquina.',
      motivo(parcial) ?? (erro instanceof Error ? erro.message : String(erro)),
    );
  }

  const linha = (saida.trim().split(/\r?\n/).pop() ?? '').replace(/^﻿/, '');
  try {
    const resposta = JSON.parse(linha) as { ok?: boolean; dados?: unknown; erro?: string };
    const dados = capturaMonitorSchema.safeParse(resposta.dados);
    if (resposta.ok && dados.success) return dados.data;
    throw new ErroApp('Não consegui capturar a tela desta máquina.', resposta.erro ?? 'resposta inesperada');
  } catch (erro) {
    if (erro instanceof ErroApp) throw erro;
    throw new ErroApp('Não consegui capturar a tela desta máquina.', 'resposta ilegível do PowerShell');
  }
}

function motivo(saida: string): string | undefined {
  try {
    const linha = (saida.trim().split(/\r?\n/).pop() ?? '').replace(/^﻿/, '');
    return (JSON.parse(linha) as { erro?: string }).erro;
  } catch {
    return undefined;
  }
}
