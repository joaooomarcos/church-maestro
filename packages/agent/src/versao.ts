import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  estadoAtualizacaoSchema,
  versaoInstaladaSchema,
  type EstadoAtualizacao,
  type VersaoInstalada,
} from '@maestro/shared';

const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CAMINHO_VERSAO = resolve(RAIZ_REPO, 'versao.txt');
const CAMINHO_ESTADO = resolve(RAIZ_REPO, 'data/atualizacao-estado.json');

/** Só aceitamos sha de commit — este valor vai virar argumento de processo. */
export const SHA_VALIDO = /^[0-9a-f]{7,40}$/i;

/** Lê `versao.txt`, escrito pelo instalador e pelo atualizador como "<sha> <notas>". */
export async function lerVersaoInstalada(): Promise<VersaoInstalada | undefined> {
  try {
    const bruto = (await readFile(CAMINHO_VERSAO, 'utf8')).trim();
    if (!bruto) return undefined;
    const [sha, ...resto] = bruto.split(/\s+/);
    if (!sha) return undefined;
    return versaoInstaladaSchema.parse({ sha, notas: resto.join(' ') });
  } catch {
    return undefined;
  }
}

/** Progresso da atualização em andamento, que o atualizador vai escrevendo. */
export async function lerEstadoAtualizacao(): Promise<EstadoAtualizacao | undefined> {
  try {
    const json: unknown = JSON.parse(await readFile(CAMINHO_ESTADO, 'utf8'));
    const resultado = estadoAtualizacaoSchema.safeParse(json);
    return resultado.success ? resultado.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Dispara o atualizador solto deste processo (`detached`), porque o primeiro
 * que ele faz é derrubar este agente para trocar os arquivos — e depois subi-lo
 * de novo pela tarefa agendada (Windows) ou pelo systemd (Linux).
 */
export function dispararAtualizacao(sha: string): void {
  if (!SHA_VALIDO.test(sha)) throw new Error(`sha inválido: ${sha}`);

  const ehWindows = platform() === 'win32';
  const comando = ehWindows ? 'wscript.exe' : 'bash';
  const argumentos = ehWindows
    ? [resolve(RAIZ_REPO, 'scripts/iniciar-oculto.vbs'), 'update', sha]
    : [resolve(RAIZ_REPO, 'scripts/atualizar.sh'), '--sha', sha];

  const filho = spawn(comando, argumentos, {
    cwd: RAIZ_REPO,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  filho.unref();
}
