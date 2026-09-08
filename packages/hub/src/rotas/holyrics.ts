import type { FastifyInstance } from 'fastify';
import { ROTAS, acaoHolyricsSchema } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderDispositivoNaoEncontrado, responderErroDriver, responderRequisicaoInvalida } from './erros.js';

export function registrarRotasHolyrics(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.holyricsAcao, async (req, reply) => {
    const corpo = acaoHolyricsSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Requisição inválida: ${corpo.error.message}`);
    }
    const { dispositivo: dispositivoId, acao, indice, ativar } = corpo.data;
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) {
      return responderDispositivoNaoEncontrado(reply, dispositivoId);
    }

    try {
      switch (acao) {
        case 'proximo':
          await ctx.drivers.holyrics.proximo(dispositivo);
          break;
        case 'anterior':
          await ctx.drivers.holyrics.anterior(dispositivo);
          break;
        case 'irPara':
          if (indice === undefined) {
            return responderRequisicaoInvalida(reply, 'Ação "irPara" exige o campo "indice".');
          }
          await ctx.drivers.holyrics.irPara(dispositivo, indice);
          break;
        case 'encerrar':
          await ctx.drivers.holyrics.encerrarApresentacao(dispositivo);
          break;
        case 'f8':
          await ctx.drivers.holyrics.definirF(dispositivo, 8, ativar ?? true);
          break;
        case 'f9':
          await ctx.drivers.holyrics.definirF(dispositivo, 9, ativar ?? true);
          break;
        case 'f10':
          await ctx.drivers.holyrics.definirF(dispositivo, 10, ativar ?? true);
          break;
      }
      return reply.send({ ok: true });
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });
}
