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

  /** A imagem do slide que está no telão (ou do próximo), repassada do agente daquela máquina. */
  app.get(ROTAS.pptSlide, async (req, reply) => {
    const { dispositivo: dispositivoId, qual } = req.query as { dispositivo?: string; qual?: string };
    if (!dispositivoId) return responderRequisicaoInvalida(reply, 'Informe o dispositivo na consulta.');
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, dispositivoId);

    try {
      const { imagem, tipo, slide } = await ctx.drivers.agente.miniaturaPowerPoint(
        dispositivo,
        qual === 'proximo' ? 'proximo' : 'atual',
      );
      void reply.header('content-type', tipo).header('cache-control', 'no-store');
      if (slide !== null) void reply.header('x-maestro-slide', String(slide));
      return reply.send(imagem);
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });
}
