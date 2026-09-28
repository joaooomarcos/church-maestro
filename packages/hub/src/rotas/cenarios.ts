import type { FastifyInstance } from 'fastify';
import {
  ROTAS,
  executarCenarioSchema,
  salvarCenarioSchema,
  slugificar,
  type Cenario,
} from '@maestro/shared';
import { executarCenario } from '../cenarios/executar.js';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

/** id a partir do nome, sem colidir com outro cenário. */
function novoId(ctx: ContextoApp, nome: string): string {
  const base = slugificar(nome) || 'cenario';
  let id = base;
  for (let n = 2; ctx.cenarios().some((c) => c.id === id); n++) id = `${base}-${n}`;
  return id;
}

export function registrarRotasCenarios(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.cenarios, async (_req, reply) => {
    return reply.send({ cenarios: ctx.cenarios() });
  });

  // Criar (sem id) ou editar (com id).
  app.post(ROTAS.cenarios, async (req, reply) => {
    const corpo = salvarCenarioSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(
        reply,
        'Cenário incompleto: ele precisa de um nome e de pelo menos um passo.',
      );
    }
    const id = corpo.data.id ?? novoId(ctx, corpo.data.nome);
    const cenario: Cenario = { ...corpo.data, id };
    return reply.send(await ctx.salvarCenario(cenario));
  });

  app.delete<{ Params: { id: string } }>(ROTAS.cenario, async (req, reply) => {
    await ctx.removerCenario(req.params.id);
    return reply.send({ ok: true });
  });

  app.post(ROTAS.executarCenario, async (req, reply) => {
    const corpo = executarCenarioSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Requisição inválida: ${corpo.error.message}`);
    }

    const cenario = ctx.cenarios().find((c) => c.id === corpo.data.cenarioId);
    if (!cenario) {
      return responderRequisicaoInvalida(reply, `Cenário "${corpo.data.cenarioId}" não existe.`);
    }

    return reply.send(await executarCenario(ctx, cenario));
  });
}
