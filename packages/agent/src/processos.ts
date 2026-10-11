import { exec } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import {
  APLICATIVOS,
  PROCESSOS_POR_APLICATIVO,
  normalizarNomeProcesso,
  type Aplicativo,
} from '@maestro/shared';

const execAsync = promisify(exec);

const DURACAO_CACHE_MS = 3000;

/**
 * Programas que têm processos sempre rodando além da janela: o RustDesk
 * instalado como serviço mantém o serviço, o `--server`, o `--tray` e, durante
 * um acesso, o `--cm`. Para eles, "aberto" é a janela principal — o processo
 * sem argumento nenhum —, e é só nela que o painel mexe.
 */
export const EXECUTAVEL_SO_JANELA: Partial<Record<Aplicativo, string>> = { rustdesk: 'rustdesk.exe' };

type ConsultaLinhasDeComando = (executavel: string) => Promise<string[] | null>;
let consultarLinhas: ConsultaLinhasDeComando | undefined;

/** O agente liga isto à ponte do Windows na subida; sem ela vale só o nome do processo. */
export function definirConsultaLinhasDeComando(consulta: ConsultaLinhasDeComando | undefined): void {
  consultarLinhas = consulta;
}

/** Há um processo sem argumentos, ou seja, a janela principal do programa? */
export function temJanelaPrincipal(linhas: string[]): boolean {
  return linhas.some((linha) => {
    const limpa = linha.trim();
    if (!limpa) return false;
    return limpa.replace(/^("[^"]*"|\S+)\s*/, '') === '';
  });
}

async function refinarSoJanela(resultado: Record<Aplicativo, boolean>): Promise<Record<Aplicativo, boolean>> {
  if (!consultarLinhas) return resultado;
  const refinado = { ...resultado };
  for (const [app, executavel] of Object.entries(EXECUTAVEL_SO_JANELA) as [Aplicativo, string][]) {
    if (!refinado[app]) continue;
    const linhas = await consultarLinhas(executavel);
    // Sem resposta, fica o que o nome do processo disse.
    if (linhas) refinado[app] = temJanelaPrincipal(linhas);
  }
  return refinado;
}

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
      .map(normalizarNomeProcesso);
  }

  const { stdout } = await execAsync('ps -eo comm=');
  return stdout
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((caminho) => {
      // ps costuma trazer o caminho completo do binário no Linux/macOS.
      const base = caminho.split('/').pop() ?? caminho;
      return normalizarNomeProcesso(base);
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

  const resultado = await refinarSoJanela(aplicativosAbertos(nomes));
  cache = { ts: Date.now(), resultado };
  return resultado;
}

/** Recebe nomes de processo como o sistema devolve e diz quais aplicativos estão abertos. */
export function aplicativosAbertos(nomes: string[]): Record<Aplicativo, boolean> {
  const normalizados = nomes.map(normalizarNomeProcesso);
  const resultado = todosFalse();
  for (const app of APLICATIVOS) {
    const padroes = PROCESSOS_POR_APLICATIVO[app];
    resultado[app] = normalizados.some((nome) => padroes.some((padrao) => nome.includes(padrao)));
  }
  return resultado;
}
