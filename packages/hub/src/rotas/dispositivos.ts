import type { FastifyInstance } from 'fastify';
import { ROTAS, dispositivoConfigSchema } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderDispositivoNaoEncontrado, responderRequisicaoInvalida } from './erros.js';

export function registrarRotasDispositivos(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.dispositivos, async (_req, reply) => {
    return reply.send({ dispositivos: ctx.dispositivos() });
  });

  app.put(ROTAS.dispositivos, async (req, reply) => {
    const corpo = dispositivoConfigSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Dispositivo inválido: ${corpo.error.message}`);
    }
    if (!ctx.obterDispositivo(corpo.data.id)) {
      return responderDispositivoNaoEncontrado(reply, corpo.data.id);
    }
    const atualizado = await ctx.atualizarDispositivo(corpo.data);
    return reply.send(atualizado);
  });
}
