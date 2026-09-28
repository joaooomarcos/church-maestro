import type { FastifyInstance } from 'fastify';
import { ROTAS, definirMonitorAvisosSchema, pedidoAvisoSchema } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { enviarAviso } from '../avisos/enviar.js';
import { responderDispositivoNaoEncontrado, responderRequisicaoInvalida } from './erros.js';

/** Avisos na tela das máquinas: mandar agora e escolher em que monitor aparecem. */
export function registrarRotasAvisos(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.aviso, async (req, reply) => {
    const corpo = pedidoAvisoSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, 'Aviso inválido: escreva a mensagem (até 300 letras).');
    }
    try {
      return reply.send(await enviarAviso(ctx, corpo.data));
    } catch (erro) {
      return responderRequisicaoInvalida(reply, erro instanceof Error ? erro.message : 'Aviso inválido.');
    }
  });

  app.put<{ Params: { id: string } }>(ROTAS.monitorAvisos, async (req, reply) => {
    const corpo = definirMonitorAvisosSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, 'Monitor inválido.');
    }
    const dispositivo = ctx.obterDispositivo(req.params.id);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, req.params.id);

    const { monitorAvisos: _anterior, ...resto } = dispositivo;
    const atualizado = await ctx.atualizarDispositivo(
      corpo.data.monitor ? { ...resto, monitorAvisos: corpo.data.monitor } : resto,
    );
    return reply.send({ monitor: atualizado.monitorAvisos ?? null });
  });
}
