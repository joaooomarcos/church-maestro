import { z } from 'zod';
import { DIAS_SEMANA } from './cenarios.js';
import {
  configLegendasSchema,
  type ConfigLegendas,
  type DispositivoConfig,
  type FaixaHorario,
} from './dispositivos.js';

/**
 * Legendas da transmissão: cada Holyrics publica a letra (música) e o texto
 * bíblico (leitura) em páginas web que o OBS abre como fontes de navegador.
 * Aqui ficam os contratos de Ajustes › Legendas e as regras que hub e painel
 * precisam enxergar igual.
 */

/** Holyrics que entram no teste: os marcados como usados em "Programas de cada máquina". */
export function usaHolyrics(dispositivo: DispositivoConfig): boolean {
  if (!dispositivo.servicos.holyrics) return false;
  return dispositivo.apps ? dispositivo.apps.includes('holyrics') : true;
}

export interface LegendasResolvidas {
  /** Máquina com o OBS que exibe as legendas. */
  obs: DispositivoConfig;
  config: ConfigLegendas;
  /**
   * true quando veio do formato antigo (`sourceLegenda`/`legendaUrl`): uma
   * fonte só, sem cena nem grupos. O teste avisa para completar em Ajustes.
   */
  legado: boolean;
}

/**
 * Acha a configuração das legendas: a nova (`servicos.obs.legendas`) ou, na
 * falta dela, monta uma equivalente a partir do formato antigo.
 */
export function resolverLegendas(dispositivos: DispositivoConfig[]): LegendasResolvidas | null {
  const comConfig = dispositivos.find((d) => d.servicos.obs?.legendas);
  if (comConfig?.servicos.obs?.legendas) {
    return { obs: comConfig, config: comConfig.servicos.obs.legendas, legado: false };
  }

  const antigo = dispositivos.find((d) => d.servicos.obs?.sourceLegenda);
  const fonte = antigo?.servicos.obs?.sourceLegenda;
  if (!antigo || !fonte) return null;
  const holyrics =
    dispositivos.find((d) => usaHolyrics(d) && d.servicos.holyrics?.legendaUrl) ??
    dispositivos.find((d) => usaHolyrics(d));
  return {
    obs: antigo,
    config: configLegendasSchema.parse({
      holyrics: holyrics ? [{ dispositivo: holyrics.id, fonteMusica: fonte }] : [],
    }),
    legado: true,
  };
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** A faixa proibida em que `agora` cai, ou null. Faixa com fim antes do início atravessa a meia-noite. */
export function faixaProibidaAgora(faixas: FaixaHorario[], agora: Date): FaixaHorario | null {
  const dia = agora.getDay();
  const ontem = (dia + 6) % 7;
  const atual = agora.getHours() * 60 + agora.getMinutes();
  for (const faixa of faixas) {
    const inicio = minutos(faixa.inicio);
    const fim = minutos(faixa.fim);
    if (inicio <= fim) {
      if (faixa.dias.includes(dia) && atual >= inicio && atual < fim) return faixa;
    } else {
      // Ex.: 22:00–01:00 — vale da noite do dia marcado até a madrugada seguinte.
      if (faixa.dias.includes(dia) && atual >= inicio) return faixa;
      if (faixa.dias.includes(ontem) && atual < fim) return faixa;
    }
  }
  return null;
}

/** "Dom, Qua 19:00–21:30" */
export function descreverFaixa(faixa: FaixaHorario): string {
  const dias = [...faixa.dias]
    .sort((a, b) => a - b)
    .map((d) => DIAS_SEMANA[d])
    .join(', ');
  return `${dias} ${faixa.inicio}–${faixa.fim}`;
}

/** PUT de Ajustes › Legendas: grava a configuração na máquina do OBS. */
export const pedidoSalvarLegendasSchema = z.object({
  /** id do dispositivo com o OBS. */
  dispositivo: z.string().min(1),
  config: configLegendasSchema,
});

export type PedidoSalvarLegendas = z.infer<typeof pedidoSalvarLegendasSchema>;

/** GET de Ajustes › Legendas. */
export interface RespostaLegendas {
  /** Máquina do OBS onde a configuração está (ou a sugerida), null se nenhuma tem OBS. */
  obs: string | null;
  /** Máquinas com OBS, para escolher. */
  maquinasObs: Array<{ id: string; nome: string }>;
  /** Holyrics que entram no teste (marcados como usados). */
  holyrics: Array<{ id: string; nome: string }>;
  config: ConfigLegendas;
  /** A configuração mostrada veio do formato antigo e ainda não foi salva no novo. */
  legado: boolean;
}

export interface ItemEstruturaObs {
  nome: string;
  /** inputKind do OBS (ex.: "browser_source"); null para grupos e cenas aninhadas. */
  tipo: string | null;
  grupo: boolean;
}

/** O que o OBS tem, para o painel sugerir cena, grupos e fontes por nome. */
export interface EstruturaObs {
  cenas: Array<{ nome: string; itens: ItemEstruturaObs[] }>;
  grupos: Array<{ nome: string; itens: ItemEstruturaObs[] }>;
}

export const pedidoAtualizarFonteSchema = z.object({
  /** id do dispositivo com o OBS. */
  dispositivo: z.string().min(1),
  fonte: z.string().min(1),
});

export type PedidoAtualizarFonte = z.infer<typeof pedidoAtualizarFonteSchema>;
