import type { FastifyInstance } from 'fastify';
import {
  ROTAS,
  arquivoAutomacoesSchema,
  ehAoLigar,
  type ProximoAgendamento,
  type RespostaAutomacoes,
} from '@maestro/shared';
import { proximaExecucao, type Agendador } from '../automacoes/agendador.js';
import { ultimaExecucaoDe } from '../automacoes/historico.js';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

/** Quantos horários o card do Painel mostra. */
const PROXIMOS_NO_PAINEL = 2;

function montarResposta(ctx: ContextoApp, agendador: Agendador): RespostaAutomacoes {
  const automacoes = ctx.automacoes();
  const agora = new Date();
  const proximas: Record<string, number> = {};
  const todas: ProximoAgendamento[] = [];
  for (const agendamento of automacoes.agendamentos) {
    if (ehAoLigar(agendamento)) continue;
    const proxima = proximaExecucao(agendamento, agora);
    if (proxima === null) continue;
    // `proximas` some com o interruptor geral desligado; a lista do Painel não,
    // porque o card precisa mostrar o horário e avisar que está desligado.
    if (automacoes.ativo) proximas[agendamento.id] = proxima;
    const cenario = ctx.cenarios().find((c) => c.id === agendamento.cenarioId);
    todas.push({
      agendamentoId: agendamento.id,
      cenarioId: agendamento.cenarioId,
      cenarioNome: cenario?.nome ?? 'Cenário removido',
      quando: proxima,
    });
  }
  const proximosAgendamentos = todas.sort((a, b) => a.quando - b.quando).slice(0, PROXIMOS_NO_PAINEL);
  return {
    ...automacoes,
    historico: agendador.historico(),
    proximas,
    ultimaExecucao: ultimaExecucaoDe(ctx),
    proximosAgendamentos,
  };
}

/** Automações (por horário e "quando uma máquina ligar") e o liga/desliga geral delas. */
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
        'Automação incompleta: escolha o cenário e, conforme o tipo, os dias e a hora ou a máquina.',
      );
    }
    const semCenario = corpo.data.agendamentos.find(
      (item) => !ctx.cenarios().some((c) => c.id === item.cenarioId),
    );
    if (semCenario) {
      return responderRequisicaoInvalida(reply, 'Uma das automações aponta para um cenário que não existe mais.');
    }
    const semMaquina = corpo.data.agendamentos.find(
      (item) => ehAoLigar(item) && !ctx.obterDispositivo(item.dispositivo),
    );
    if (semMaquina) {
      return responderRequisicaoInvalida(reply, 'Uma das automações aponta para uma máquina que não está cadastrada.');
    }
    await ctx.salvarAutomacoes(corpo.data);
    return reply.send(montarResposta(ctx, agendador));
  });
}
