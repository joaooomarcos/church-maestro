import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { APLICATIVOS, PROCESSOS_POR_APLICATIVO, type Aplicativo } from '@maestro/shared';

const execAsync = promisify(exec);

const DURACAO_CACHE_MS = 3000;

let cache: { ts: number; resultado: Record<Aplicativo, boolean> } | null = null;
let jaLogouErro = false;

function todosFalse(): Record<Aplicativo, boolean> {
  const resultado = {} as Record<Aplicativo, boolean>;
  for (const app of APLICATIVOS) {
    resultado[app] = false;
  }
  return resultado;
}

/** Lista de nomes de processo em execução, em minúsculas e sem `.exe`. */
async function nomesDeProcessosAtivos(): Promise<string[]> {
  if (platform() === 'win32') {
    const { stdout } = await execAsync('tasklist /fo csv /nh');
    return stdout
      .split(/\r?\n/)
      .map((linha) => linha.split(',')[0]?.replace(/^"|"$/g, '').trim())
      .filter((nome): nome is string => Boolean(nome))
      .map((nome) => nome.toLowerCase().replace(/\.exe$/, ''));
  }

  const { stdout } = await execAsync('ps -eo comm=');
  return stdout
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((caminho) => {
      // ps costuma trazer o caminho completo do binário no Linux/macOS.
      const base = caminho.split('/').pop() ?? caminho;
      return base.toLowerCase();
    });
}

/**
 * Mapa de aplicativo -> está rodando. Cacheado por alguns segundos porque o
 * hub pergunta com frequência e listar processos tem custo.
 */
export async function listarProcessos(): Promise<Record<Aplicativo, boolean>> {
  if (cache && Date.now() - cache.ts < DURACAO_CACHE_MS) {
    return cache.resultado;
  }

  let nomes: string[];
  try {
    nomes = await nomesDeProcessosAtivos();
    jaLogouErro = false;
  } catch (err) {
    if (!jaLogouErro) {
      console.error('[agente] falha ao listar processos, assumindo tudo fechado:', err);
      jaLogouErro = true;
    }
    const resultado = todosFalse();
    cache = { ts: Date.now(), resultado };
    return resultado;
  }

  const resultado = todosFalse();
  for (const app of APLICATIVOS) {
    const padroes = PROCESSOS_POR_APLICATIVO[app];
    resultado[app] = nomes.some((nome) => padroes.some((padrao) => nome.includes(padrao)));
  }

  cache = { ts: Date.now(), resultado };
  return resultado;
}
