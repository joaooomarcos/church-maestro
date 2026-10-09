import type { FastifyInstance } from 'fastify';
import {
  ROTAS,
  configLegendasSchema,
  pedidoAtualizarFonteSchema,
  pedidoSalvarLegendasSchema,
  resolverLegendas,
  usaHolyrics,
  type RespostaLegendas,
} from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import {
  responderDispositivoNaoEncontrado,
  responderErroDriver,
  responderRequisicaoInvalida,
} from './erros.js';

function montarResposta(ctx: ContextoApp): RespostaLegendas {
  const dispositivos = ctx.dispositivos();
  const resolvidas = resolverLegendas(dispositivos);
  const maquinasObs = dispositivos.filter((d) => d.servicos.obs).map((d) => ({ id: d.id, nome: d.nome }));
  return {
    obs: resolvidas?.obs.id ?? maquinasObs[0]?.id ?? null,
    maquinasObs,
    holyrics: dispositivos.filter(usaHolyrics).map((d) => ({ id: d.id, nome: d.nome })),
    config: resolvidas?.config ?? configLegendasSchema.parse({}),
    legado: resolvidas?.legado ?? false,
  };
}

/** Ajustes › Legendas e a correção "Atualizar fonte" do teste de legendas. */
export function registrarRotasLegendas(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.legendas, async (_req, reply) => reply.send(montarResposta(ctx)));

  app.put(ROTAS.legendas, async (req, reply) => {
    const corpo = pedidoSalvarLegendasSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Configuração de legendas inválida: ${corpo.error.message}`);
    }
    const alvo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!alvo) return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);
    if (!alvo.servicos.obs) {
      return responderRequisicaoInvalida(reply, `A máquina "${alvo.nome}" não tem o OBS configurado.`);
    }

    // Uma configuração só: se ela mudou de máquina, sai da anterior.
    for (const outro of ctx.dispositivos()) {
      if (outro.id === alvo.id || !outro.servicos.obs?.legendas) continue;
      const { legendas: _antiga, ...obsSemLegendas } = outro.servicos.obs;
      await ctx.atualizarDispositivo({ ...outro, servicos: { ...outro.servicos, obs: obsSemLegendas } });
    }
    await ctx.atualizarDispositivo({
      ...alvo,
      servicos: { ...alvo.servicos, obs: { ...alvo.servicos.obs, legendas: corpo.data.config } },
    });
    return reply.send(montarResposta(ctx));
  });

  app.get<{ Querystring: { dispositivo?: string } }>(ROTAS.legendasEstruturaObs, async (req, reply) => {
    const id = req.query.dispositivo ?? montarResposta(ctx).obs;
    if (!id) return responderRequisicaoInvalida(reply, 'Nenhuma máquina tem o OBS configurado.');
    const dispositivo = ctx.obterDispositivo(id);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, id);
    try {
      return reply.send(await ctx.drivers.obs.estrutura(dispositivo));
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });

  app.post(ROTAS.legendasAtualizarFonte, async (req, reply) => {
    const corpo = pedidoAtualizarFonteSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Pedido inválido: ${corpo.error.message}`);
    }
    const dispositivo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);
    try {
      await ctx.drivers.obs.atualizarFonte(dispositivo, corpo.data.fonte);
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
    return reply.send({ ok: true });
  });
}
