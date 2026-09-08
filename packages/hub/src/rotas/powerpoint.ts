import type { FastifyInstance } from 'fastify';
import { ROTAS, acaoPptSchema, type ComandoPpt } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderDispositivoNaoEncontrado, responderErroDriver, responderRequisicaoInvalida } from './erros.js';

export function registrarRotasPowerPoint(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.pptAcao, async (req, reply) => {
    const corpo = acaoPptSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Requisição inválida: ${corpo.error.message}`);
    }
    const { dispositivo: dispositivoId, acao, slide } = corpo.data;
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) {
      return responderDispositivoNaoEncontrado(reply, dispositivoId);
    }

    let comando: ComandoPpt;
    if (acao === 'irPara') {
      if (slide === undefined) {
        return responderRequisicaoInvalida(reply, 'Ação "irPara" exige o campo "slide".');
      }
      comando = { acao: 'irPara', slide };
    } else {
      comando = { acao };
    }

    try {
      const status = await ctx.drivers.agente.comandarPowerPoint(dispositivo, comando);
      return reply.send(status);
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });
}
