import type { PedidoAviso } from '@maestro/shared';
import type { ContextoApp } from '../rotas/contexto.js';

export interface ResultadoAviso {
  /** Uma frase por máquina que não mostrou o aviso. */
  falhas: string[];
}

/**
 * Mostra o aviso nas máquinas (cada uma no monitor escolhido no painel) e, se
 * pedido, no painel de quem estiver com o celular aberto. As máquinas recebem
 * ao mesmo tempo: um PC desligado não atrasa o aviso dos outros.
 */
export async function enviarAviso(ctx: ContextoApp, pedido: PedidoAviso): Promise<ResultadoAviso> {
  if (pedido.dispositivos.length === 0 && !pedido.noPainel) {
    throw new Error('o aviso não tem para onde ir: escolha uma máquina ou o painel');
  }

  if (pedido.noPainel) {
    ctx.store.transmitirMensagem({ tipo: 'alerta', texto: pedido.mensagem, ts: Date.now() });
  }

  const resultados = await Promise.all(
    pedido.dispositivos.map(async (id): Promise<string | null> => {
      const dispositivo = ctx.obterDispositivo(id);
      if (!dispositivo) return `a máquina "${id}" não está cadastrada`;
      try {
        await ctx.drivers.agente.mostrarAviso(dispositivo, {
          mensagem: pedido.mensagem,
          monitor: dispositivo.monitorAvisos ?? null,
        });
        return null;
      } catch (erro) {
        return `${dispositivo.nome}: ${erro instanceof Error ? erro.message : 'não respondeu'}`;
      }
    }),
  );

  return { falhas: resultados.filter((falha): falha is string => falha !== null) };
}
