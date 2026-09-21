import type { FastifyInstance } from 'fastify';
import { ROTAS, ajustesSchema } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

/** Ajustes da operação que a equipe muda pelo painel, sem editar arquivo. */
export function registrarRotasAjustes(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.ajustes, async (_req, reply) => {
    return reply.send({ intervaloHeartbeatMs: ctx.config.intervaloHeartbeatMs });
  });

  app.post(ROTAS.ajustes, async (req, reply) => {
    const corpo = ajustesSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(
        reply,
        'Intervalo inválido. Use um valor entre 2 e 120 segundos.',
      );
    }

    const config = await ctx.atualizarConfigHub(corpo.data);
    app.log.info({ intervaloHeartbeatMs: config.intervaloHeartbeatMs }, 'ajustes alterados');
    return reply.send({ intervaloHeartbeatMs: config.intervaloHeartbeatMs });
  });
}
