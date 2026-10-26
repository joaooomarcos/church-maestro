import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ROTAS,
  caminhoConvidado,
  heartbeatAgenteSchema,
  urlConvidadoComPin,
  type ErroApi,
  type RespostaControleAgente,
} from '@maestro/shared';
import { urlNaRede } from '../versoes.js';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

/** Registro de agente usa o token compartilhado no header, não a sessão de PIN. */
export function registrarRotasAgentes(app: FastifyInstance, ctx: ContextoApp): void {
  const tokenInvalido = (reply: FastifyReply): FastifyReply => {
    const erro: ErroApi = { erro: 'token_invalido', mensagem: 'Token de agente inválido.' };
    return reply.code(401).send(erro);
  };

  app.post(ROTAS.registrarAgente, async (req, reply) => {
    if (req.headers['x-maestro-token'] !== ctx.config.tokenAgentes) return tokenInvalido(reply);

    const corpo = heartbeatAgenteSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Heartbeat inválido: ${corpo.error.message}`);
    }
    const heartbeat = corpo.data;

    const dispositivo = ctx.obterDispositivo(heartbeat.dispositivoId);
    if (!dispositivo) {
      const erro: ErroApi = {
        erro: 'dispositivo_nao_pareado',
        mensagem: `A máquina "${heartbeat.dispositivoId}" não está pareada neste hub. Rode "npm run setup" nela.`,
      };
      return reply.code(404).send(erro);
    }

    ctx.store.registrarHeartbeat(heartbeat.dispositivoId, heartbeat);

    const novoHost = heartbeat.ips[0];
    if (!dispositivo.fixarHost && novoHost && novoHost !== dispositivo.host) {
      await ctx.atualizarDispositivo({ ...dispositivo, host: novoHost });
    }

    // O agente adota este intervalo na próxima batida: é assim que a equipe
    // muda o ritmo de todas as máquinas mexendo num lugar só.
    return reply.send({ ok: true, intervaloHeartbeatMs: ctx.config.intervaloHeartbeatMs });
  });

  /**
   * Tela de controle do agente: os links fixos desta máquina, com o PIN no
   * endereço (o QR já entra direto), e as janelas do Studio Monitor dela.
   */
  app.get(ROTAS.controleAgente, async (req, reply) => {
    if (req.headers['x-maestro-token'] !== ctx.config.tokenAgentes) return tokenInvalido(reply);

    const { dispositivo: id } = req.query as { dispositivo?: string };
    const dispositivo = id ? ctx.obterDispositivo(id) : undefined;
    if (!dispositivo) {
      const erro: ErroApi = {
        erro: 'dispositivo_nao_pareado',
        mensagem: `A máquina "${id ?? ''}" não está pareada neste hub. Rode "npm run setup" nela.`,
      };
      return reply.code(404).send(erro);
    }

    const resposta: RespostaControleAgente = {
      dispositivoNome: dispositivo.nome,
      links: ctx
        .linksConvidado()
        .filter((link) => link.dispositivo === dispositivo.id)
        .map((link) => ({
          id: link.id,
          nome: link.nome,
          modo: link.modo,
          url: urlConvidadoComPin(urlNaRede(ctx.config.porta, caminhoConvidado(link.token)), link.pin),
        })),
      portasNdi: dispositivo.servicos.ndiMonitor?.portas ?? [],
    };
    return reply.send(resposta);
  });
}
