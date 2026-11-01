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
/** A janela abre e fecha devagar, e a consulta abre um PowerShell: guarda por mais tempo. */
const DURACAO_CACHE_PRINCIPAL_MS = 30_000;

/**
 * Programas que têm um processo de serviço rodando sempre, além dos processos
 * principais. O RustDesk instalado como serviço mantém o serviço o tempo todo.
 * Para eles, "aberto" é ter processo principal (janela, `--tray` ou `--cm`), e o
 * critério é o do `acoes.ps1 -Acao rodando -SoPrincipal`, que deixa de fora o
 * serviço (`--service`, `--server` ou linha de comando vazia).
 */
export const APLICATIVOS_SO_PRINCIPAL: readonly Aplicativo[] = ['rustdesk'];

/** Diz se o programa tem processo principal rodando; null quando não deu para saber. */
export type ConsultaPrincipal = (app: Aplicativo) => Promise<boolean | null>;

let consultaPrincipal: ConsultaPrincipal | undefined;
const cachePrincipal = new Map<Aplicativo, { ts: number; valor: boolean | null }>();

/**
 * O agente liga isto ao `acoes.ps1` na subida (no Windows). Sem ela, vale só o
 * nome do processo.
 */
export function definirConsultaPrincipal(consulta: ConsultaPrincipal | undefined): void {
  consultaPrincipal = consulta;
  cachePrincipal.clear();
}

/** Esquece o que foi perguntado sobre processos e janelas, depois de abrir ou fechar algo. */
export function invalidarCacheProcessos(): void {
  cache = null;
  cachePrincipal.clear();
}

async function consultaPrincipalComCache(app: Aplicativo): Promise<boolean | null> {
  const guardado = cachePrincipal.get(app);
  if (guardado && Date.now() - guardado.ts < DURACAO_CACHE_PRINCIPAL_MS) return guardado.valor;
  const valor = consultaPrincipal ? await consultaPrincipal(app) : null;
  cachePrincipal.set(app, { ts: Date.now(), valor });
  return valor;
}

/**
 * Para os programas com serviço, o nome do processo diz só que existe algum
 * processo, e o serviço sempre existe. Quem diz se está aberto é a consulta de
 * processo principal. Sem resposta, fica o que o nome disse.
 */
export async function refinarSoPrincipal(
  resultado: Record<Aplicativo, boolean>,
  consultar: ConsultaPrincipal,
): Promise<Record<Aplicativo, boolean>> {
  const refinado = { ...resultado };
  for (const app of APLICATIVOS_SO_PRINCIPAL) {
    if (!refinado[app]) continue;
    const janela = await consultar(app);
    if (janela !== null) refinado[app] = janela;
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

  const resultado = await refinarSoPrincipal(aplicativosAbertos(nomes), consultaPrincipalComCache);
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
