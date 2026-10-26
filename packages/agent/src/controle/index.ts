import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import QRCode from 'qrcode';
import {
  CAMINHOS_CONTROLE_AGENTE,
  CAMINHOS_SOLO,
  NOMES_MODOS,
  PORTAS_PADRAO,
  ROTAS,
  pedidoFonteNdiLocalSchema,
  respostaControleAgenteSchema,
  urlConvidadoComPin,
  type ConfigAgente,
  type ErroApi,
  type RespostaControleAgente,
} from '@maestro/shared';
import { ipsLocais } from '../heartbeat.js';
import type { PontePowerPoint } from '../ppt/tipos.js';
import { criarMemoria, type Memoria } from './memoria.js';
import { lerJanelaNdi, trocarFonteNdi, type JanelaNdiLocal } from './ndiLocal.js';
import { registrarControleSolo } from './solo.js';

/**
 * Tela de controle desta máquina (http://localhost:<porta>/controle): o QR code
 * dos links fixos dela, que já entram com o PIN, e os botões do NDI. Só abre na
 * própria máquina: ninguém da rede troca o NDI daqui.
 */

const ENDERECOS_LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** Também confere o Host, para uma página de fora não alcançar a tela por DNS rebinding. */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Os links mudam pouco (a equipe cria ou troca o PIN): o hub é consultado no máximo a cada 10 s. */
const VALIDADE_HUB_MS = 10_000;
const TIMEOUT_HUB_MS = 3_000;

export interface EstadoControle {
  dispositivoNome: string;
  /** 'sem-hub' = config sem hubUrl; 'fora' = o hub não respondeu na última tentativa. */
  hub: 'ok' | 'fora' | 'sem-hub';
  /** QR dos links fixos do hub. Vazio com o hub fora: eles só funcionam com ele. */
  links: Array<{ id: string; nome: string; modo: string; svg: string }>;
  /**
   * Com o hub fora, o QR do controle solo (fala direto com este agente). null
   * com o hub no ar, ou sem endereço de rede para pôr no QR.
   */
  solo: { svg: string; endereco: string } | null;
  /**
   * null = a máquina não tem Studio Monitor cadastrado no painel. Sem resposta
   * do hub, só as janelas que atenderam nas portas de sempre.
   */
  ndi: JanelaNdiLocal[] | null;
}

function ehLocal(req: FastifyRequest): boolean {
  const host = (req.headers.host ?? '').replace(/:\d+$/, '').toLowerCase();
  return ENDERECOS_LOCAIS.has(req.ip) && HOSTS_LOCAIS.has(host);
}

function recusarDeFora(req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
  if (!ehLocal(req)) {
    const corpo: ErroApi = {
      erro: 'so-nesta-maquina',
      mensagem: 'A tela de controle só abre na própria máquina (http://localhost).',
    };
    reply.code(403).send(corpo);
    return;
  }
  done();
}

function criarLeitorHub(config: ConfigAgente, memoria: Memoria) {
  let ultimo: RespostaControleAgente | null = null;
  let lidoEm = 0;
  let online = false;
  let pendente: Promise<void> | null = null;

  async function buscar(hubUrl: string): Promise<void> {
    try {
      const url = new URL(ROTAS.controleAgente, hubUrl);
      url.searchParams.set('dispositivo', config.dispositivoId);
      const resposta = await fetch(url, {
        headers: { 'x-maestro-token': config.token },
        signal: AbortSignal.timeout(TIMEOUT_HUB_MS),
      });
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      ultimo = respostaControleAgenteSchema.parse(await resposta.json());
      online = true;
      await memoria
        .lembrarHub({ dispositivoNome: ultimo.dispositivoNome, portasNdi: ultimo.portasNdi, holyrics: ultimo.holyrics })
        .catch(() => {});
    } catch {
      // Fica com o que já tinha: o QR de antes continua valendo enquanto o hub volta.
      online = false;
    } finally {
      lidoEm = Date.now();
    }
  }

  return async (): Promise<{ dados: RespostaControleAgente | null; online: boolean }> => {
    const hubUrl = config.hubUrl;
    if (!hubUrl) return { dados: null, online: false };
    if (Date.now() - lidoEm > VALIDADE_HUB_MS) {
      pendente ??= buscar(hubUrl).finally(() => {
        pendente = null;
      });
      await pendente;
    }
    return { dados: ultimo, online };
  };
}

/** O SVG de cada endereço é gerado uma vez só. */
const qrPorUrl = new Map<string, Promise<string>>();

function qrSvg(url: string): Promise<string> {
  let svg = qrPorUrl.get(url);
  if (!svg) {
    svg = QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    qrPorUrl.set(url, svg);
  }
  return svg;
}

export function registrarTelaControle(
  app: FastifyInstance,
  config: ConfigAgente,
  ponte: PontePowerPoint,
  memoria: Memoria = criarMemoria(config),
): void {
  registrarControleSolo(app, config, ponte, memoria);
  const lerHub = criarLeitorHub(config, memoria);
  const caminhoPagina = join(dirname(fileURLToPath(import.meta.url)), 'pagina.html');

  async function montarEstado(): Promise<EstadoControle> {
    const { dados, online } = await lerHub();
    const lembrado = memoria.hub();
    // Sem o hub agora, vale o que ele disse da última vez; sem nem isso, as portas de sempre.
    const conhecido = (online ? dados : null) ?? lembrado ?? null;
    const portas = conhecido ? conhecido.portasNdi : PORTAS_PADRAO.ndiMonitor;
    const janelas = await Promise.all(portas.map(lerJanelaNdi));
    const ndi = conhecido ? (portas.length > 0 ? janelas : null) : janelas.filter((j) => j.online);

    const links = await Promise.all(
      (online && dados ? dados.links : []).map(async (link) => ({
        id: link.id,
        nome: link.nome,
        modo: NOMES_MODOS[link.modo],
        svg: await qrSvg(link.url),
      })),
    );

    let solo: EstadoControle['solo'] = null;
    const ip = ipsLocais()[0];
    if (!online && ip) {
      const endereco = `http://${ip}:${config.porta}${CAMINHOS_SOLO.pagina}`;
      solo = { endereco, svg: await qrSvg(urlConvidadoComPin(endereco, memoria.pinSolo())) };
    }

    return {
      dispositivoNome: conhecido?.dispositivoNome ?? config.dispositivoId,
      hub: config.hubUrl ? (online ? 'ok' : 'fora') : 'sem-hub',
      links,
      solo,
      ndi,
    };
  }

  app.get(CAMINHOS_CONTROLE_AGENTE.pagina, { preHandler: recusarDeFora }, async (_req, reply) => {
    const html = await readFile(caminhoPagina, 'utf8');
    reply.header('content-type', 'text/html; charset=utf-8').header('cache-control', 'no-store').send(html);
  });

  app.get(CAMINHOS_CONTROLE_AGENTE.estado, { preHandler: recusarDeFora }, async () => montarEstado());

  /** O QR solo leva o PIN: se uma foto dele vazar, troca aqui e o antigo para de valer. */
  app.post(CAMINHOS_CONTROLE_AGENTE.trocarPinSolo, { preHandler: recusarDeFora }, async () => {
    await memoria.trocarPinSolo();
    return { ok: true };
  });

  app.post(CAMINHOS_CONTROLE_AGENTE.ndi, { preHandler: recusarDeFora }, async (req, reply) => {
    const analisado = pedidoFonteNdiLocalSchema.safeParse(req.body);
    if (!analisado.success) {
      const corpo: ErroApi = { erro: 'comando-invalido', mensagem: 'Fonte de NDI inválida.' };
      reply.code(400).send(corpo);
      return;
    }
    try {
      await trocarFonteNdi(analisado.data.porta, analisado.data.fonte);
      return { ok: true };
    } catch (err) {
      const corpo: ErroApi = {
        erro: 'falha-ndi',
        mensagem: err instanceof Error ? err.message : 'Não consegui trocar a fonte.',
      };
      reply.code(502).send(corpo);
      return;
    }
  });
}
