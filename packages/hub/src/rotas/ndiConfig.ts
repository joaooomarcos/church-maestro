import type { FastifyInstance } from 'fastify';
import {
  ROTAS,
  pedidoSalvarNdiSchema,
  type MaquinaNdiConfig,
  type RespostaNdiConfig,
} from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderDispositivoNaoEncontrado, responderRequisicaoInvalida } from './erros.js';

function montarResposta(ctx: ContextoApp): RespostaNdiConfig {
  const estados = new Map(ctx.store.obterSnapshot().dispositivos.map((e) => [e.id, e]));
  const maquinas: MaquinaNdiConfig[] = ctx
    .dispositivos()
    .filter((d) => d.servicos.agente || d.servicos.ndiMonitor)
    .map((d) => {
      const agente = estados.get(d.id)?.agente;
      const portas = d.servicos.ndiMonitor?.portas ?? [];
      return {
        id: d.id,
        nome: d.nome,
        online: agente?.online ?? false,
        monitores: agente?.monitores ?? null,
        envioMonitor: d.monitorNdiEnvio ?? null,
        janelas: portas.map((porta) => ({
          porta,
          monitor: d.servicos.ndiMonitor?.monitores?.[String(porta)] ?? null,
        })),
      };
    })
    // Quem recebe imagem (tem janelas) primeiro: é onde a equipe mexe mais.
    .sort((a, b) => Number(b.janelas.length > 0) - Number(a.janelas.length > 0));
  return { maquinas };
}

/** Ajustes › NDI: monitor de cada janela do Studio Monitor e monitor que o Screen Capture envia. */
export function registrarRotasNdiConfig(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.ndiConfig, async (_req, reply) => reply.send(montarResposta(ctx)));

  app.put(ROTAS.ndiConfig, async (req, reply) => {
    const corpo = pedidoSalvarNdiSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Configuração do NDI inválida: ${corpo.error.message}`);
    }
    const alvo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!alvo) return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);

    let atualizado = alvo;

    if (corpo.data.janelas) {
      const ndi = alvo.servicos.ndiMonitor;
      if (!ndi) {
        return responderRequisicaoInvalida(reply, `A máquina "${alvo.nome}" não tem o NDI Studio Monitor configurado.`);
      }
      const monitores = { ...(ndi.monitores ?? {}) };
      for (const [porta, monitor] of Object.entries(corpo.data.janelas)) {
        if (!ndi.portas.includes(Number(porta))) {
          return responderRequisicaoInvalida(reply, `A janela ${porta} não existe em "${alvo.nome}".`);
        }
        if (monitor) monitores[porta] = monitor;
        else delete monitores[porta];
      }
      const { monitores: _antigos, ...semMonitores } = ndi;
      atualizado = {
        ...atualizado,
        servicos: {
          ...atualizado.servicos,
          ndiMonitor: Object.keys(monitores).length > 0 ? { ...semMonitores, monitores } : semMonitores,
        },
      };
    }

    if (corpo.data.envioMonitor !== undefined) {
      const { monitorNdiEnvio: _anterior, ...resto } = atualizado;
      atualizado = corpo.data.envioMonitor ? { ...resto, monitorNdiEnvio: corpo.data.envioMonitor } : resto;
    }

    await ctx.atualizarDispositivo(atualizado);
    return reply.send(montarResposta(ctx));
  });
}
