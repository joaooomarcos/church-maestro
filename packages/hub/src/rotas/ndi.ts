import type { FastifyInstance } from 'fastify';
import { ROTAS, definirFonteNdiSchema } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderDispositivoNaoEncontrado, responderErroDriver, responderRequisicaoInvalida } from './erros.js';

export function registrarRotasNdi(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.ndiFonte, async (req, reply) => {
    const corpo = definirFonteNdiSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Requisição inválida: ${corpo.error.message}`);
    }
    const { dispositivo: dispositivoId, porta, fonte } = corpo.data;
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) {
      return responderDispositivoNaoEncontrado(reply, dispositivoId);
    }

    try {
      await ctx.drivers.ndi.definirFonte(dispositivo.host, porta, fonte);
      return reply.send({ ok: true });
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });
}
