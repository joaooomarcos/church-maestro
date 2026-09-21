import type { FastifyInstance } from 'fastify';
import { ROTAS, acaoAppSchema } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import {
  responderDispositivoNaoEncontrado,
  responderErroDriver,
  responderRequisicaoInvalida,
} from './erros.js';

/** Abrir, fechar, reiniciar ou trazer para frente um programa de uma máquina. */
export function registrarRotasApps(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.appAcao, async (req, reply) => {
    const corpo = acaoAppSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Ação inválida: ${corpo.error.message}`);
    }

    const dispositivo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!dispositivo) {
      return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);
    }

    try {
      await ctx.drivers.agente.acaoApp(dispositivo, {
        app: corpo.data.app,
        acao: corpo.data.acao,
      });
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }

    return reply.send({ ok: true });
  });
}
