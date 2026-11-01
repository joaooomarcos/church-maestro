import type { FastifyInstance } from 'fastify';
import { ROTAS, ajustesSchema, type RespostaAjustes } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderErroDriver, responderRequisicaoInvalida } from './erros.js';

/** A chave de API nunca volta ao painel: só se há uma guardada. */
function resposta(ctx: ContextoApp): RespostaAjustes {
  return {
    intervaloHeartbeatMs: ctx.config.intervaloHeartbeatMs,
    youtubeCanalId: ctx.config.youtubeCanalId ?? '',
    youtubeConfigurado: Boolean(ctx.config.youtubeCanalId && ctx.config.youtubeChaveApi),
  };
}

/** Ajustes da operação que a equipe muda pelo painel, sem editar arquivo. */
export function registrarRotasAjustes(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.ajustes, async (_req, reply) => reply.send(resposta(ctx)));

  app.post(ROTAS.ajustes, async (req, reply) => {
    const corpo = ajustesSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(
        reply,
        corpo.error.issues[0]?.message ?? 'Intervalo inválido. Use um valor entre 2 e 120 segundos.',
      );
    }

    const { removerYoutubeChave, youtubeChaveApi, youtubeCanalId, ...resto } = corpo.data;
    const mudanca: Parameters<ContextoApp['atualizarConfigHub']>[0] = { ...resto };
    // Canal vazio apaga; ausente mantém. Chave vazia ou ausente mantém, salvo pedido explícito.
    if (youtubeCanalId !== undefined) mudanca.youtubeCanalId = youtubeCanalId === '' ? undefined : youtubeCanalId;
    if (removerYoutubeChave) mudanca.youtubeChaveApi = undefined;
    else if (youtubeChaveApi) mudanca.youtubeChaveApi = youtubeChaveApi;

    await ctx.atualizarConfigHub(mudanca);
    // O log não leva a chave nem o corpo da requisição.
    app.log.info({ intervaloHeartbeatMs: ctx.config.intervaloHeartbeatMs }, 'ajustes alterados');
    return reply.send(resposta(ctx));
  });

  app.post(ROTAS.youtubeTeste, async (_req, reply) => {
    const { youtubeCanalId: canalId, youtubeChaveApi: chaveApi } = ctx.config;
    if (!canalId || !chaveApi) {
      return responderRequisicaoInvalida(reply, 'Preencha o ID do canal e a chave de API, e salve, antes de testar.');
    }
    try {
      return reply.send({ aoVivo: await ctx.drivers.youtube.aoVivo({ canalId, chaveApi }) });
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });
}
