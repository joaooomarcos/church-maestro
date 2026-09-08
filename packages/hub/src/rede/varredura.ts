import net from 'node:net';
import os from 'node:os';
import { PORTAS_PADRAO, type ServicoDescoberto } from '@maestro/shared';

const TIMEOUT_CONEXAO_MS = 300;
const TIMEOUT_PROBE_MS = 300;
const CONCORRENCIA_MAXIMA = 64;

const PORTAS_VARREDURA: readonly number[] = [
  ...PORTAS_PADRAO.ndiMonitor,
  PORTAS_PADRAO.holyricsApi,
  PORTAS_PADRAO.obsWebsocket,
  PORTAS_PADRAO.agente,
];

/** Deduz a sub-rede local a partir da 1ª interface IPv4 não-loopback, assumindo /24. */
function deduzirCidrLocal(): string {
  const interfaces = os.networkInterfaces();
  for (const nome of Object.keys(interfaces)) {
    for (const info of interfaces[nome] ?? []) {
      if (info.family === 'IPv4' && !info.internal) {
        const partes = info.address.split('.');
        return `${partes[0]}.${partes[1]}.${partes[2]}.0/24`;
      }
    }
  }
  throw new Error('não foi possível deduzir a sub-rede local: nenhuma interface IPv4 encontrada');
}

function ipParaNumero(ip: string): number {
  const partes = ip.split('.').map(Number);
  return (
    (((partes[0] ?? 0) << 24) | ((partes[1] ?? 0) << 16) | ((partes[2] ?? 0) << 8) | (partes[3] ?? 0)) >>>
    0
  );
}

function numeroParaIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

/** Lista todos os hosts utilizáveis (exclui rede e broadcast) de um CIDR tipo "192.168.0.0/24". */
export function listarHostsDoCidr(cidr: string): string[] {
  const [ip, prefixoTexto] = cidr.split('/');
  if (!ip || !prefixoTexto) throw new Error(`CIDR inválido: "${cidr}"`);
  const prefixo = Number(prefixoTexto);
  if (!Number.isInteger(prefixo) || prefixo < 22 || prefixo > 30) {
    throw new Error('só são aceitos prefixos entre /22 e /30 nesta varredura (sub-redes de igreja são pequenas)');
  }
  const totalHosts = 2 ** (32 - prefixo);
  const base = ipParaNumero(ip) & (~(totalHosts - 1) >>> 0);
  const hosts: string[] = [];
  for (let i = 1; i < totalHosts - 1; i++) {
    hosts.push(numeroParaIp(base + i));
  }
  return hosts;
}

function testarPortaTcp(host: string, porta: number, timeoutMs = TIMEOUT_CONEXAO_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let concluido = false;
    const finalizar = (aberto: boolean) => {
      if (concluido) return;
      concluido = true;
      socket.destroy();
      resolve(aberto);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finalizar(true));
    socket.once('timeout', () => finalizar(false));
    socket.once('error', () => finalizar(false));
    socket.connect(porta, host);
  });
}

/** Roda `tarefa` sobre `itens` com no máximo `limite` execuções simultâneas. */
async function executarComConcorrencia<T, R>(
  itens: T[],
  limite: number,
  tarefa: (item: T) => Promise<R>,
): Promise<R[]> {
  const resultados: R[] = new Array(itens.length);
  let proximo = 0;

  async function trabalhador(): Promise<void> {
    for (;;) {
      const indice = proximo++;
      if (indice >= itens.length) return;
      const item = itens[indice] as T;
      resultados[indice] = await tarefa(item);
    }
  }

  const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, () => trabalhador());
  await Promise.all(trabalhadores);
  return resultados;
}

async function buscarComTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_PROBE_MS);
  try {
    return await fetch(url, { ...init, signal: controlador.signal });
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Rede de segurança extra além do `AbortController` de `buscarComTimeout`: em alguns
 * ambientes um `fetch` perdido não aborta no tempo esperado quando várias chamadas
 * saem em paralelo. Isto garante que a varredura nunca trava esperando um probe —
 * na pior das hipóteses, o serviço volta sem `identificacao`.
 */
function comLimiteDeTempo<T>(promessa: Promise<T>, ms: number, valorPadrao: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const temporizador = setTimeout(() => resolve(valorPadrao), ms);
    promessa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      () => {
        clearTimeout(temporizador);
        resolve(valorPadrao);
      },
    );
  });
}

/** Confirma um NDI Studio Monitor via `GET /v1/sources` (API REST leve que ele expõe). */
async function probeNdiMonitor(host: string, porta: number): Promise<string | undefined> {
  try {
    const resp = await buscarComTimeout(`http://${host}:${porta}/v1/sources`);
    if (!resp.ok) return undefined;
    const dados: unknown = await resp.json().catch(() => undefined);
    if (Array.isArray(dados)) return `${dados.length} fonte(s) visíveis`;
    return 'Studio Monitor respondeu';
  } catch {
    return undefined;
  }
}

/** A API do Holyrics responde em `/api/GetTokenInfo` mesmo com token inválido — a resposta em si confirma o serviço. */
async function probeHolyrics(host: string, porta: number): Promise<string | undefined> {
  try {
    const resp = await buscarComTimeout(`http://${host}:${porta}/api/GetTokenInfo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: '' }),
    });
    return resp.status > 0 ? 'API do Holyrics respondeu' : undefined;
  } catch {
    return undefined;
  }
}

async function probeAgente(host: string, porta: number): Promise<string | undefined> {
  try {
    const resp = await buscarComTimeout(`http://${host}:${porta}/health`);
    if (!resp.ok) return undefined;
    return 'agente respondeu em /health';
  } catch {
    return undefined;
  }
}

const TIMEOUT_IDENTIFICACAO_MS = 2000;

async function identificarServico(host: string, porta: number): Promise<ServicoDescoberto> {
  if ((PORTAS_PADRAO.ndiMonitor as readonly number[]).includes(porta)) {
    const identificacao = await comLimiteDeTempo(
      probeNdiMonitor(host, porta),
      TIMEOUT_IDENTIFICACAO_MS,
      undefined,
    );
    return { host, porta, tipo: 'ndi-monitor', identificacao };
  }
  if (porta === PORTAS_PADRAO.holyricsApi) {
    const identificacao = await comLimiteDeTempo(
      probeHolyrics(host, porta),
      TIMEOUT_IDENTIFICACAO_MS,
      undefined,
    );
    return { host, porta, tipo: 'holyrics', identificacao };
  }
  if (porta === PORTAS_PADRAO.agente) {
    const identificacao = await comLimiteDeTempo(
      probeAgente(host, porta),
      TIMEOUT_IDENTIFICACAO_MS,
      undefined,
    );
    return { host, porta, tipo: 'agente', identificacao };
  }
  // obs-websocket fala WebSocket puro, não HTTP — a porta já é bem distintiva o bastante.
  return { host, porta, tipo: 'obs' };
}

/** Varre a sub-rede em busca de NDI Monitor, Holyrics, OBS e agentes Maestro nas portas conhecidas. */
export async function varrerRede(cidr?: string): Promise<ServicoDescoberto[]> {
  const alvo = cidr ?? deduzirCidrLocal();
  const hosts = listarHostsDoCidr(alvo);
  const combinacoes = hosts.flatMap((host) => PORTAS_VARREDURA.map((porta) => ({ host, porta })));

  const abertos = await executarComConcorrencia(combinacoes, CONCORRENCIA_MAXIMA, async ({ host, porta }) => {
    const aberto = await testarPortaTcp(host, porta);
    return aberto ? { host, porta } : undefined;
  });

  const encontrados = abertos.filter((x): x is { host: string; porta: number } => x !== undefined);
  return Promise.all(encontrados.map((e) => identificarServico(e.host, e.porta)));
}
