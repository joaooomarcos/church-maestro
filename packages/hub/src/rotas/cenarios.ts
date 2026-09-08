import type { FastifyInstance } from 'fastify';
import {
  ROTAS,
  executarCenarioSchema,
  type AcaoCenario,
  type ResultadoCenario,
} from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';


function descreverAcao(acao: AcaoCenario): string {
  switch (acao.tipo) {
    case 'ndi.definirFonte':
      return `NDI ${acao.dispositivo}:${acao.porta} → ${acao.fonte ?? 'Nenhuma'}`;
    case 'obs.definirCena':
      return `OBS ${acao.dispositivo} → cena "${acao.cena}"`;
    case 'holyrics.f8':
      return `Holyrics ${acao.dispositivo} → F8 ${acao.ativar ? 'ligado' : 'desligado'}`;
    case 'holyrics.encerrarApresentacao':
      return `Holyrics ${acao.dispositivo} → encerrar apresentação`;
    case 'espera':
      return `Esperar ${acao.ms}ms`;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executarAcao(ctx: ContextoApp, acao: AcaoCenario): Promise<void> {
  switch (acao.tipo) {
    case 'ndi.definirFonte': {
      const dispositivo = ctx.obterDispositivo(acao.dispositivo);
      if (!dispositivo) throw new Error(`dispositivo "${acao.dispositivo}" não está cadastrado`);
      await ctx.drivers.ndi.definirFonte(dispositivo.host, acao.porta, acao.fonte);
      return;
    }
    case 'obs.definirCena': {
      const dispositivo = ctx.obterDispositivo(acao.dispositivo);
      if (!dispositivo) throw new Error(`dispositivo "${acao.dispositivo}" não está cadastrado`);
      await ctx.drivers.obs.definirCena(dispositivo, acao.cena);
      return;
    }
    case 'holyrics.f8': {
      const dispositivo = ctx.obterDispositivo(acao.dispositivo);
      if (!dispositivo) throw new Error(`dispositivo "${acao.dispositivo}" não está cadastrado`);
      await ctx.drivers.holyrics.definirF(dispositivo, 8, acao.ativar);
      return;
    }
    case 'holyrics.encerrarApresentacao': {
      const dispositivo = ctx.obterDispositivo(acao.dispositivo);
      if (!dispositivo) throw new Error(`dispositivo "${acao.dispositivo}" não está cadastrado`);
      await ctx.drivers.holyrics.encerrarApresentacao(dispositivo);
      return;
    }
    case 'espera':
      await esperar(acao.ms);
      return;
  }
}

export function registrarRotasCenarios(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.cenarios, async (_req, reply) => {
    return reply.send({ cenarios: ctx.cenarios });
  });

  app.post(ROTAS.executarCenario, async (req, reply) => {
    const corpo = executarCenarioSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Requisição inválida: ${corpo.error.message}`);
    }

    const cenario = ctx.cenarios.find((c) => c.id === corpo.data.cenarioId);
    if (!cenario) {
      return responderRequisicaoInvalida(reply, `Cenário "${corpo.data.cenarioId}" não existe.`);
    }

    const acoesResultado: ResultadoCenario['acoes'] = [];
    for (const [indice, acao] of cenario.acoes.entries()) {
      const descricao = descreverAcao(acao);
      try {
        await executarAcao(ctx, acao);
        acoesResultado.push({ indice, descricao, ok: true });
      } catch (erro) {
        acoesResultado.push({
          indice,
          descricao,
          ok: false,
          erro: erro instanceof Error ? erro.message : 'erro desconhecido',
        });
        // Não aborta: o cenário segue tentando as próximas ações mesmo se uma falhar.
      }
    }

    const resultado: ResultadoCenario = {
      cenarioId: cenario.id,
      ts: Date.now(),
      ok: acoesResultado.every((a) => a.ok),
      acoes: acoesResultado,
    };
    return reply.send(resultado);
  });
}
