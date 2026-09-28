import type { FastifyInstance } from 'fastify';
import { ROTAS, arquivoAutomacoesSchema, type RespostaAutomacoes } from '@maestro/shared';
import { proximaExecucao, type Agendador } from '../automacoes/agendador.js';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

function montarResposta(ctx: ContextoApp, agendador: Agendador): RespostaAutomacoes {
  const automacoes = ctx.automacoes();
  const agora = new Date();
  const proximas: Record<string, number> = {};
  if (automacoes.ativo) {
    for (const agendamento of automacoes.agendamentos) {
      const proxima = proximaExecucao(agendamento, agora);
      if (proxima !== null) proximas[agendamento.id] = proxima;
    }
  }
  return { ...automacoes, historico: agendador.historico(), proximas };
}

/** Agendamentos semanais de cenários e o liga/desliga geral das automações. */
export function registrarRotasAutomacoes(
  app: FastifyInstance,
  ctx: ContextoApp,
  agendador: Agendador,
): void {
  app.get(ROTAS.automacoes, async (_req, reply) => reply.send(montarResposta(ctx, agendador)));

  // A tela manda a lista inteira de volta: é pequena, e evita meia edição.
  app.put(ROTAS.automacoes, async (req, reply) => {
    const corpo = arquivoAutomacoesSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(
        reply,
        'Agendamento incompleto: escolha o cenário, pelo menos um dia e a hora.',
      );
    }
    const semCenario = corpo.data.agendamentos.find(
      (agendamento) => !ctx.cenarios().some((c) => c.id === agendamento.cenarioId),
    );
    if (semCenario) {
      return responderRequisicaoInvalida(reply, 'Um dos agendamentos aponta para um cenário que não existe mais.');
    }
    await ctx.salvarAutomacoes(corpo.data);
    return reply.send(montarResposta(ctx, agendador));
  });
}
