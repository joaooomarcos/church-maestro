import { resolverLegendas, type DispositivoConfig, type Snapshot } from '@maestro/shared';
import type { Drivers } from '../drivers/tipos.js';

/**
 * Quando um Holyrics liga depois do OBS, as fontes web dele no OBS ficam com a
 * página que não carregou — vazias, até alguém clicar em "Atualizar". Este
 * módulo faz esse clique sozinho: ao ver um Holyrics passar de offline para
 * online, sem nada no ar, atualiza as fontes daquele Holyrics no OBS.
 *
 * Fica de fora do poller e do agendador de automações de propósito: só lê o
 * snapshot de tempos em tempos, então nenhuma das três lógicas depende das outras.
 */

const INTERVALO_PADRAO_MS = 2000;
/** Dá tempo do servidor web do Holyrics subir depois que a API respondeu. */
const ESPERA_PADRAO_MS = 4000;

export interface OpcoesAtualizarAoLigar {
  dispositivos(): DispositivoConfig[];
  drivers: Drivers;
  snapshot(): Snapshot;
  intervaloMs?: number;
  esperaMs?: number;
  /** Frase para o log e para o aviso da equipe. */
  avisar?(texto: string, nivel: 'info' | 'alerta'): void;
}

export interface AtualizadorAoLigar {
  iniciar(): void;
  parar(): void;
  /** Uma rodada: compara com a anterior e atualiza o que ligou. Exposto para os testes. */
  verificar(): Promise<void>;
}

export function criarAtualizadorAoLigar(opcoes: OpcoesAtualizarAoLigar): AtualizadorAoLigar {
  /** Último estado visto de cada Holyrics; só vale transição a partir de um "offline" observado. */
  const ultimoOnline = new Map<string, boolean>();
  const emAndamento = new Set<string>();
  let temporizador: NodeJS.Timeout | undefined;

  const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  function semNadaNoAr(id: string): boolean {
    const estado = opcoes.snapshot().dispositivos.find((d) => d.id === id)?.holyrics;
    return Boolean(estado?.online && estado.apresentacao === null);
  }

  async function atualizarFontesDe(holyricsId: string): Promise<void> {
    await dormir(opcoes.esperaMs ?? ESPERA_PADRAO_MS);
    // Se alguém já exibiu algo nesse meio-tempo, atualizar apagaria a legenda no ar.
    if (!semNadaNoAr(holyricsId)) return;

    const dispositivos = opcoes.dispositivos();
    const resolvidas = resolverLegendas(dispositivos);
    if (!resolvidas || !resolvidas.config.atualizarAoLigar) return;
    const entrada = resolvidas.config.holyrics.find((h) => h.dispositivo === holyricsId);
    const fontes = [entrada?.fonteMusica, entrada?.fonteLeitura].filter((f): f is string => Boolean(f));
    if (fontes.length === 0) return;

    const nome = dispositivos.find((d) => d.id === holyricsId)?.nome ?? holyricsId;
    const falhas: string[] = [];
    for (const fonte of fontes) {
      try {
        await opcoes.drivers.obs.atualizarFonte(resolvidas.obs, fonte);
      } catch {
        falhas.push(fonte);
      }
    }
    if (falhas.length === 0) {
      opcoes.avisar?.(`O Holyrics do ${nome} ligou: as fontes de legenda dele foram atualizadas no OBS.`, 'info');
    } else if (falhas.length < fontes.length) {
      opcoes.avisar?.(
        `O Holyrics do ${nome} ligou, mas não deu para atualizar no OBS: ${falhas.join(', ')}. Atualize à mão (botão direito › Atualizar).`,
        'alerta',
      );
    }
    // Todas falharam: quase sempre é o OBS ainda fechado — e quando ele abrir,
    // carrega as páginas com o Holyrics já no ar. Nada a avisar.
  }

  async function verificar(): Promise<void> {
    const tarefas: Promise<void>[] = [];
    for (const estado of opcoes.snapshot().dispositivos) {
      if (!estado.holyrics) continue;
      const online = estado.holyrics.online;
      const antes = ultimoOnline.get(estado.id);
      ultimoOnline.set(estado.id, online);
      if (antes !== false || !online || estado.holyrics.apresentacao !== null) continue;
      if (emAndamento.has(estado.id)) continue;
      emAndamento.add(estado.id);
      tarefas.push(
        atualizarFontesDe(estado.id)
          .catch(() => undefined)
          .finally(() => emAndamento.delete(estado.id)),
      );
    }
    await Promise.all(tarefas);
  }

  return {
    iniciar() {
      if (temporizador) return;
      temporizador = setInterval(() => void verificar(), opcoes.intervaloMs ?? INTERVALO_PADRAO_MS);
    },
    parar() {
      if (temporizador) clearInterval(temporizador);
      temporizador = undefined;
    },
    verificar,
  };
}
