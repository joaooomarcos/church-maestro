import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CAMINHOS_SOLO,
  NOMES_MODOS,
  acaoSoloSchema,
  type ConfigAgente,
  type ErroApi,
  type ModoConvidado,
} from '@maestro/shared';
import { ErroApp, enviarTecla } from '../apps/index.js';
import { ErroPowerPoint, type PontePowerPoint } from '../ppt/tipos.js';
import type { Memoria } from './memoria.js';

/**
 * Controle solo: com o hub desligado, o celular passa os slides falando direto
 * com o agente. Só Voltar e Avançar. Estas rotas abrem para a rede (o celular
 * está nela), então cada pedido traz o PIN solo, e quem erra demais espera.
 */

const TENTATIVAS_MAX = 10;
const JANELA_TENTATIVAS_MS = 5 * 60_000;
const TIMEOUT_HOLYRICS_MS = 1500;

export interface EstadoSolo {
  dispositivoNome: string;
  modos: Array<{ modo: ModoConvidado; nome: string }>;
  /** "Slide 3 de 12", quando dá para saber. */
  resumo: string;
}

function pinConfere(esperado: string, recebido: unknown): boolean {
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function holyricsLocal(
  holyrics: { porta: number; token: string },
  acao: string,
  corpo: Record<string, unknown> = {},
): Promise<void> {
  const url = `http://127.0.0.1:${holyrics.porta}/api/${acao}?token=${encodeURIComponent(holyrics.token)}`;
  let corpoResposta: { status?: string; error?: string } | null;
  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_HOLYRICS_MS),
    });
    corpoResposta = (await resposta.json().catch(() => null)) as typeof corpoResposta;
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  } catch (err) {
    throw new ErroApp(
      'Não consegui falar com o Holyrics. Ele está aberto, com o API Server ligado?',
      err instanceof Error ? err.message : String(err),
    );
  }
  if (corpoResposta?.status === 'error') {
    throw new ErroApp(`O Holyrics recusou o comando: ${corpoResposta.error ?? 'erro desconhecido'}`);
  }
}

export function registrarControleSolo(
  app: FastifyInstance,
  config: ConfigAgente,
  ponte: PontePowerPoint,
  memoria: Memoria,
): void {
  const caminhoPagina = join(dirname(fileURLToPath(import.meta.url)), 'solo.html');
  const erros = new Map<string, number[]>();

  function modos(): EstadoSolo['modos'] {
    const lista: ModoConvidado[] = [];
    if (memoria.hub()?.holyrics) lista.push('holyrics');
    if (ponte.disponivel) lista.push('powerpoint');
    if (platform() === 'win32') lista.push('teclado');
    return lista.map((modo) => ({ modo, nome: NOMES_MODOS[modo] }));
  }

  function exigirPin(req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
    const agora = Date.now();
    const recentes = (erros.get(req.ip) ?? []).filter((t) => agora - t < JANELA_TENTATIVAS_MS);
    if (recentes.length >= TENTATIVAS_MAX) {
      const corpo: ErroApi = {
        erro: 'muitas_tentativas',
        mensagem: 'Muitas tentativas com PIN errado. Aguarde 5 minutos e tente de novo.',
      };
      reply.code(429).send(corpo);
      return;
    }
    if (!pinConfere(memoria.pinSolo(), req.headers['x-maestro-pin'])) {
      erros.set(req.ip, [...recentes, agora]);
      const corpo: ErroApi = { erro: 'pin_incorreto', mensagem: 'PIN incorreto.' };
      reply.code(401).send(corpo);
      return;
    }
    erros.delete(req.ip);
    done();
  }

  app.get(CAMINHOS_SOLO.pagina, async (_req, reply) => {
    const html = await readFile(caminhoPagina, 'utf8');
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store').send(html);
  });

  app.get(CAMINHOS_SOLO.estado, { preHandler: exigirPin }, async (): Promise<EstadoSolo> => {
    let resumo = '';
    if (ponte.disponivel) {
      const status = await ponte.status().catch(() => null);
      if (status?.emApresentacao) resumo = `PowerPoint: slide ${status.slide ?? '?'} de ${status.totalSlides ?? '?'}`;
    }
    return { dispositivoNome: memoria.hub()?.dispositivoNome ?? config.dispositivoId, modos: modos(), resumo };
  });

  app.post(CAMINHOS_SOLO.acao, { preHandler: exigirPin }, async (req, reply) => {
    const analisado = acaoSoloSchema.safeParse(req.body);
    if (!analisado.success || !modos().some((m) => m.modo === analisado.data.modo)) {
      const corpo: ErroApi = { erro: 'comando-invalido', mensagem: 'Comando inválido.' };
      reply.code(400).send(corpo);
      return;
    }
    const { modo, acao } = analisado.data;
    try {
      if (modo === 'holyrics') {
        const holyrics = memoria.hub()?.holyrics;
        if (holyrics) await holyricsLocal(holyrics, acao === 'proximo' ? 'ActionNext' : 'ActionPrevious');
      } else if (modo === 'powerpoint') {
        await ponte.executar({ acao });
      } else {
        // Setas: vão para a janela que estiver na frente, como no controle pelo hub.
        await enviarTecla(undefined, acao);
      }
      return { ok: true };
    } catch (err) {
      if (err instanceof ErroApp || err instanceof ErroPowerPoint) {
        const corpo: ErroApi = { erro: 'falha-solo', mensagem: err.message, detalhe: err.causaTecnica };
        reply.code(502).send(corpo);
        return;
      }
      throw err;
    }
  });
}
