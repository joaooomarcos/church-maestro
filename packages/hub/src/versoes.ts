import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { networkInterfaces, platform } from 'node:os';
import path from 'node:path';
import { versaoInstaladaSchema, type VersaoDisponivel, type VersaoInstalada } from '@maestro/shared';
import { raizRepo } from './config.js';

const REPO = 'joaooomarcos/church-maestro';
const CACHE_MS = 60_000;
const TIMEOUT_MS = 8000;
const QUANTAS_VERSOES = 10;

/** Só aceitamos sha de commit — este valor vira argumento de processo. */
export const SHA_VALIDO = /^[0-9a-f]{7,40}$/i;

/** Versão que esta máquina (a do hub) tem instalada, de `versao.txt`. */
export async function lerVersaoInstalada(): Promise<VersaoInstalada | undefined> {
  try {
    const bruto = (await readFile(path.join(raizRepo, 'versao.txt'), 'utf8')).trim();
    if (!bruto) return undefined;
    const [sha, ...resto] = bruto.split(/\s+/);
    if (!sha) return undefined;
    return versaoInstaladaSchema.parse({ sha, notas: resto.join(' ') });
  } catch {
    return undefined;
  }
}

export interface VersoesDisponiveis {
  aprovada: VersaoDisponivel | null;
  disponiveis: VersaoDisponivel[];
  aviso?: string;
}

let cache: { ts: number; dados: VersoesDisponiveis } | undefined;

async function buscarJson<T>(url: string): Promise<T> {
  const resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!resposta.ok) throw new Error(`GitHub respondeu ${resposta.status}`);
  return (await resposta.json()) as T;
}

/**
 * Lista o que dá para instalar: a versão aprovada (canal.json, escrita por
 * `npm run publicar`) e os commits recentes do main. Cacheado por um minuto —
 * a API do GitHub sem token permite poucas chamadas por hora.
 */
export async function obterVersoesDisponiveis(): Promise<VersoesDisponiveis> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.dados;

  let aprovada: VersaoDisponivel | null = null;
  let disponiveis: VersaoDisponivel[] = [];
  let aviso: string | undefined;

  try {
    const marca = Date.now();
    const canal = await buscarJson<{ ativo?: boolean; sha?: string; notas?: string; liberadoEm?: string }>(
      `https://raw.githubusercontent.com/${REPO}/main/canal.json?t=${marca}`,
    );
    if (canal.sha) {
      aprovada = {
        sha: canal.sha,
        notas: canal.notas ?? '',
        ...(canal.liberadoEm ? { data: canal.liberadoEm } : {}),
        aprovada: true,
      };
    }
  } catch {
    aviso = 'Não consegui consultar a versão aprovada (sem internet?).';
  }

  try {
    const commits = await buscarJson<
      Array<{ sha: string; commit: { message: string; author?: { date?: string } } }>
    >(`https://api.github.com/repos/${REPO}/commits?per_page=${QUANTAS_VERSOES}`);
    disponiveis = commits.map((commit) => ({
      sha: commit.sha,
      notas: commit.commit.message.split('\n')[0] ?? '',
      ...(commit.commit.author?.date ? { data: commit.commit.author.date } : {}),
      aprovada: commit.sha === aprovada?.sha,
    }));
  } catch {
    aviso ??= 'Não consegui listar as versões no GitHub (sem internet?).';
  }

  // A aprovada pode ser antiga demais para aparecer entre os commits recentes.
  if (aprovada && !disponiveis.some((v) => v.sha === aprovada?.sha)) {
    disponiveis = [aprovada, ...disponiveis];
  }

  const dados: VersoesDisponiveis = { aprovada, disponiveis, ...(aviso ? { aviso } : {}) };
  cache = { ts: Date.now(), dados };
  return dados;
}

/** IPv4 desta máquina — usado para saber qual dispositivo é a máquina do hub. */
export function ipsLocais(): string[] {
  const ips: string[] = ['127.0.0.1', 'localhost'];
  for (const enderecos of Object.values(networkInterfaces())) {
    for (const info of enderecos ?? []) {
      const ehIpv4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (ehIpv4 && !info.internal) ips.push(info.address);
    }
  }
  return ips;
}

/**
 * Atualiza a própria máquina do hub. Sai solto deste processo (`detached`):
 * o atualizador derruba o hub no meio da troca e o sobe de novo depois.
 */
export function dispararAtualizacaoLocal(sha: string): void {
  if (!SHA_VALIDO.test(sha)) throw new Error(`sha inválido: ${sha}`);

  const ehWindows = platform() === 'win32';
  const comando = ehWindows ? 'wscript.exe' : 'bash';
  const argumentos = ehWindows
    ? [path.join(raizRepo, 'scripts/iniciar-oculto.vbs'), 'update', sha]
    : [path.join(raizRepo, 'scripts/atualizar.sh'), '--sha', sha];

  const filho = spawn(comando, argumentos, {
    cwd: raizRepo,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  filho.unref();
}
