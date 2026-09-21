import { readFileSync } from 'node:fs';
import { hostname, networkInterfaces, platform } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APLICATIVOS,
  PROCESSOS_POR_APLICATIVO,
  ROTAS,
  heartbeatAgenteSchema,
  type Aplicativo,
  type ConfigAgente,
  type HeartbeatAgente,
} from '@maestro/shared';
import { listarProcessos } from './processos.js';
import { lerVersaoInstalada } from './versao.js';
import type { PontePowerPoint } from './ppt/tipos.js';

const INTERVALO_MAXIMO_BACKOFF_MS = 60_000;

function lerVersao(): string {
  try {
    const caminho = resolve(dirname(fileURLToPath(import.meta.url)), '../package.json');
    const pkg = JSON.parse(readFileSync(caminho, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const VERSAO = lerVersao();

function soAtual(): HeartbeatAgente['so'] {
  const plataforma = platform();
  if (plataforma === 'win32') return 'windows';
  if (plataforma === 'darwin') return 'darwin';
  return 'linux';
}

/** Casa o nome do processo da frente com um dos aplicativos conhecidos. */
function appDoProcesso(processo: string): Aplicativo | null {
  for (const app of APLICATIVOS) {
    if (PROCESSOS_POR_APLICATIVO[app].some((padrao) => processo.includes(padrao))) return app;
  }
  return null;
}

/** IPv4 de todas as interfaces que não sejam loopback. */
function ipsLocais(): string[] {
  const ips: string[] = [];
  for (const enderecos of Object.values(networkInterfaces())) {
    for (const info of enderecos ?? []) {
      // Node >=18 usa a string 'IPv4'; algumas versões antigas usam o número 4.
      const ehIpv4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (ehIpv4 && !info.internal) {
        ips.push(info.address);
      }
    }
  }
  return ips;
}

/** Também usado pela rota `/health`, que expõe os mesmos dados + timestamp. */
export async function montarHeartbeat(config: ConfigAgente, ponte: PontePowerPoint): Promise<HeartbeatAgente> {
  const [processos, instalada, janela] = await Promise.all([
    listarProcessos(),
    lerVersaoInstalada(),
    ponte.janelaEmPrimeiroPlano(),
  ]);
  return heartbeatAgenteSchema.parse({
    dispositivoId: config.dispositivoId,
    hostname: hostname(),
    versao: VERSAO,
    ...(instalada ? { versaoSha: instalada.sha, versaoNotas: instalada.notas } : {}),
    so: soAtual(),
    ips: ipsLocais(),
    porta: config.porta,
    uptimeS: process.uptime(),
    processos,
    emPrimeiroPlano: janela ? { ...janela, app: appDoProcesso(janela.processo) } : null,
    capacidades: ponte.disponivel ? ['powerpoint'] : [],
  });
}

async function enviarHeartbeat(config: ConfigAgente, hubUrl: string, ponte: PontePowerPoint): Promise<void> {
  const corpo = await montarHeartbeat(config, ponte);
  const resposta = await fetch(new URL(ROTAS.registrarAgente, hubUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-maestro-token': config.token,
    },
    body: JSON.stringify(corpo),
  });

  if (!resposta.ok) {
    // 404/401 quase sempre são configuração, não rede: vale dizer o que fazer.
    const dica =
      resposta.status === 404
        ? ' — o hub não conhece esta máquina; rode "npm run setup"'
        : resposta.status === 401
          ? ' — o token não confere com o do hub; rode "npm run setup"'
          : '';
    throw new Error(`hub respondeu ${resposta.status}${dica}`);
  }
}

export interface ControleHeartbeat {
  /** Para o laço de heartbeat. Não afeta a ponte nem o servidor HTTP. */
  parar(): void;
}

/**
 * Anuncia esta máquina ao hub periodicamente. Se a config não tiver `hubUrl`,
 * fica desligado (útil rodando isolado ou em dev). Falha de rede é esperada
 * (hub pode estar desligado) — não derruba o processo, só faz backoff até
 * 60s e volta ao intervalo normal assim que o hub responder de novo.
 */
export function iniciarHeartbeat(config: ConfigAgente, ponte: PontePowerPoint): ControleHeartbeat {
  const hubUrl = config.hubUrl;
  if (!hubUrl) {
    console.log('[agente] hubUrl não configurado, heartbeat desligado');
    return { parar() {} };
  }

  let parado = false;
  let timer: NodeJS.Timeout | undefined;
  let atrasoAtualMs = config.intervaloHeartbeatMs;

  const ciclo = async (): Promise<void> => {
    if (parado) return;
    try {
      await enviarHeartbeat(config, hubUrl, ponte);
      atrasoAtualMs = config.intervaloHeartbeatMs;
    } catch (err) {
      console.debug('[agente] heartbeat falhou (hub pode estar desligado):', err);
      atrasoAtualMs = Math.min(atrasoAtualMs * 2, INTERVALO_MAXIMO_BACKOFF_MS);
    } finally {
      if (!parado) {
        timer = setTimeout(() => void ciclo(), atrasoAtualMs);
      }
    }
  };

  void ciclo();

  return {
    parar() {
      parado = true;
      if (timer) clearTimeout(timer);
    },
  };
}
