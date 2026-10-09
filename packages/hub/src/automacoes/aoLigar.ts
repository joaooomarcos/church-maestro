import { ehAoLigar, type AutomacaoAoLigar, type EstadoDispositivo } from '@maestro/shared';
import type { ContextoApp } from '../rotas/contexto.js';
import { executarERegistrar } from './historico.js';

/**
 * Só conta como "ligou" se a máquina ficou offline por pelo menos isto. Evita
 * disparar numa oscilação de rede ou num ciclo de leitura que falhou à toa.
 */
export const OFFLINE_MINIMO_MS = 60_000;

interface Situacao {
  online: boolean;
  /** Quando foi vista offline pela última vez que passou a ficar; null enquanto online. */
  offlineDesde: number | null;
}

export interface GatilhoAoLigar {
  iniciar(): void;
  parar(): void;
  /** Uma leitura de estado das máquinas; exposta para os testes. */
  processar(estados: EstadoDispositivo[]): void;
}

/**
 * Roda os cenários "Quando <máquina> ligar" quando a máquina passa de offline
 * para online. Regras que protegem o culto em andamento:
 * - a primeira leitura depois que o hub inicia só serve de ponto de partida;
 *   reiniciar o hub no meio do culto não reabre programa nenhum;
 * - sem `OFFLINE_MINIMO_MS` offline antes, não é "ligar";
 * - respeita o interruptor global, na hora de ligar e de novo depois da espera;
 * - se a máquina cair durante a espera, a execução é cancelada.
 */
export function criarGatilhoAoLigar(ctx: ContextoApp, agora: () => number = Date.now): GatilhoAoLigar {
  const situacoes = new Map<string, Situacao>();
  const pendentes = new Map<string, NodeJS.Timeout[]>();
  let cancelarObservacao: (() => void) | undefined;

  function cancelarPendentes(dispositivoId: string): void {
    for (const temporizador of pendentes.get(dispositivoId) ?? []) clearTimeout(temporizador);
    pendentes.delete(dispositivoId);
  }

  function agendar(dispositivoId: string, automacao: AutomacaoAoLigar): void {
    const temporizador = setTimeout(() => {
      const restantes = (pendentes.get(dispositivoId) ?? []).filter((t) => t !== temporizador);
      if (restantes.length > 0) pendentes.set(dispositivoId, restantes);
      else pendentes.delete(dispositivoId);

      // Revalida: o que vale é o que está salvo agora, não o de quando ligou.
      const atuais = ctx.automacoes();
      if (!atuais.ativo) return;
      const atual = atuais.agendamentos.find((a) => a.id === automacao.id);
      if (!atual || !ehAoLigar(atual) || !atual.ativo) return;
      const cenario = ctx.cenarios().find((c) => c.id === atual.cenarioId);
      if (!cenario) return;

      void executarERegistrar(ctx, cenario, 'aoLigar', atual.id)
        .then(({ resultado, registro }) => {
          const nome = ctx.obterDispositivo(dispositivoId)?.nome ?? dispositivoId;
          ctx.store.transmitirMensagem({
            tipo: 'aviso',
            nivel: resultado.ok ? 'info' : 'alerta',
            texto: resultado.ok
              ? `${nome} ligou: "${cenario.nome}" aplicado.`
              : `${nome} ligou: "${cenario.nome}" teve falhas — ${registro.resumo}`,
          });
        })
        .catch(() => {
          // executarCenario isola a falha de cada passo; aqui só evita rejeição solta
        });
    }, automacao.esperaSegundos * 1000);
    pendentes.set(dispositivoId, [...(pendentes.get(dispositivoId) ?? []), temporizador]);
  }

  function processar(estados: EstadoDispositivo[]): void {
    const agoraMs = agora();
    for (const estado of estados) {
      const anterior = situacoes.get(estado.id);

      if (!anterior) {
        // Primeira leitura: nunca dispara. Se já está offline, a contagem dos
        // 60 s começa agora (não sabemos desde quando).
        situacoes.set(estado.id, { online: estado.online, offlineDesde: estado.online ? null : agoraMs });
        continue;
      }

      if (anterior.online && !estado.online) {
        cancelarPendentes(estado.id);
        situacoes.set(estado.id, { online: false, offlineDesde: agoraMs });
        continue;
      }

      if (!anterior.online && estado.online) {
        const ficouOffline = agoraMs - (anterior.offlineDesde ?? agoraMs);
        situacoes.set(estado.id, { online: true, offlineDesde: null });
        if (ficouOffline < OFFLINE_MINIMO_MS) continue;

        const automacoes = ctx.automacoes();
        if (!automacoes.ativo) continue;
        for (const automacao of automacoes.agendamentos) {
          if (ehAoLigar(automacao) && automacao.ativo && automacao.dispositivo === estado.id) {
            agendar(estado.id, automacao);
          }
        }
      }
    }
  }

  return {
    iniciar() {
      cancelarObservacao = ctx.store.observarDispositivos(processar);
    },
    parar() {
      cancelarObservacao?.();
      for (const id of [...pendentes.keys()]) cancelarPendentes(id);
    },
    processar,
  };
}
