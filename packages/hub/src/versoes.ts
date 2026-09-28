import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { networkInterfaces, platform } from 'node:os';
import path from 'node:path';
import { versaoInstaladaSchema, type VersaoDisponivel, type VersaoInstalada } from '@maestro/shared';
import { raizRepo } from './config.js';

const REPO = 'joaooomarcos/church-maestro';
const CACHE_MS = 60_000;
const TIMEOUT_MS = 8000;

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

interface Canal {
  ativo?: boolean;
  versao?: string;
  sha?: string;
  notas?: string;
  liberadoEm?: string;
  versoes?: Array<{ versao?: string; sha?: string; notas?: string; data?: string }>;
}

async function buscarCanal(): Promise<Canal> {
  // O parâmetro fura o cache do raw.githubusercontent, que segura o arquivo ~5 min.
  const resposta = await fetch(`https://raw.githubusercontent.com/${REPO}/main/canal.json?t=${Date.now()}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) throw new Error(`GitHub respondeu ${resposta.status}`);
  return (await resposta.json()) as Canal;
}

/**
 * O que dá para instalar: as versões liberadas por `npm run publicar`, da mais
 * nova para a mais antiga, com a aprovada marcada. Vem tudo do `canal.json`,
 * um arquivo só — sem a API do GitHub, que limita as chamadas sem token.
 */
export async function obterVersoesDisponiveis(): Promise<VersoesDisponiveis> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.dados;

  let dados: VersoesDisponiveis;
  try {
    const canal = await buscarCanal();
    const disponiveis: VersaoDisponivel[] = (canal.versoes ?? [])
      .filter((v): v is { versao: string; sha: string; notas?: string; data?: string } => Boolean(v.versao && v.sha))
      .map((v) => ({
        versao: v.versao,
        sha: v.sha,
        notas: v.notas ?? '',
        ...(v.data ? { data: v.data } : {}),
        aprovada: v.sha === canal.sha,
      }));
    const aprovada = disponiveis.find((v) => v.aprovada) ?? null;
    dados = { aprovada, disponiveis };
  } catch {
    dados = { aprovada: null, disponiveis: [], aviso: 'Não consegui consultar as versões no GitHub (sem internet?).' };
  }

  cache = { ts: Date.now(), dados };
  return dados;
}

/** Número da versão de um commit instalado, se ele foi liberado. */
export function numeroDaVersao(sha: string | null, disponiveis: VersaoDisponivel[]): string | null {
  if (!sha) return null;
  return disponiveis.find((v) => v.sha.startsWith(sha) || sha.startsWith(v.sha))?.versao ?? null;
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

/** Endereço deste hub na rede da igreja — é o que vai nos QR codes. */
export function urlNaRede(porta: number, caminho: string): string {
  const ip = ipsLocais().find((endereco) => endereco !== '127.0.0.1' && endereco !== 'localhost');
  return `http://${ip ?? '127.0.0.1'}:${porta}${caminho}`;
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
