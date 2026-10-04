import { MONITOR_TODOS, type PedidoAviso } from '@maestro/shared';
import type { ContextoApp } from '../rotas/contexto.js';

export interface ResultadoAviso {
  /** Uma frase por máquina que não mostrou o aviso. */
  falhas: string[];
}

/**
 * Mostra o aviso nas máquinas (cada uma no monitor escolhido na hora do envio) e, se
 * pedido, no painel de quem estiver com o celular aberto. As máquinas recebem
 * ao mesmo tempo: um PC desligado não atrasa o aviso dos outros.
 */
export async function enviarAviso(
  ctx: ContextoApp,
  pedido: Omit<PedidoAviso, 'monitores' | 'segundos'> & Partial<Pick<PedidoAviso, 'monitores' | 'segundos'>>,
): Promise<ResultadoAviso> {
  const monitoresEscolhidos = pedido.monitores ?? {};
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
        const escolhido = id in monitoresEscolhidos ? (monitoresEscolhidos[id] ?? null) : (dispositivo.monitorAvisos ?? null);
        const monitores =
          escolhido === MONITOR_TODOS
            ? ctx.store.obterSnapshot().dispositivos.find((d) => d.id === id)?.agente?.monitores?.map((m) => m.id)
            : undefined;
        // "Todos" numa máquina que não informou os monitores cai no principal.
        const alvos: Array<string | null> = monitores?.length ? monitores : [escolhido === MONITOR_TODOS ? null : escolhido];
        await Promise.all(
          alvos.map((monitor) => ctx.drivers.agente.mostrarAviso(dispositivo, {
              mensagem: pedido.mensagem,
              monitor,
              ...(pedido.segundos ? { segundos: pedido.segundos } : {}),
            })),
        );
        return null;
      } catch (erro) {
        return `${dispositivo.nome}: ${erro instanceof Error ? erro.message : 'não respondeu'}`;
      }
    }),
  );

  return { falhas: resultados.filter((falha): falha is string => falha !== null) };
}
