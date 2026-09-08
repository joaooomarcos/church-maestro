import { z } from 'zod';

/**
 * Um cenário é uma lista de ações declarativas que põe a operação inteira num
 * estado conhecido com um toque. É o antídoto direto para "cada semana sai de
 * um jeito": em vez de lembrar sete passos, a pessoa aperta "Louvor".
 */
export const acaoCenarioSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('ndi.definirFonte'),
    /** id do dispositivo que roda o Studio Monitor. */
    dispositivo: z.string(),
    /** Porta da janela do Studio Monitor (80 = primeira janela). */
    porta: z.number().int().positive().default(80),
    /** Nome exato da fonte NDI, ou null para "None". */
    fonte: z.string().nullable(),
  }),
  z.object({
    tipo: z.literal('obs.definirCena'),
    dispositivo: z.string(),
    cena: z.string(),
  }),
  z.object({
    tipo: z.literal('holyrics.f8'),
    dispositivo: z.string(),
    ativar: z.boolean(),
  }),
  z.object({
    tipo: z.literal('holyrics.encerrarApresentacao'),
    dispositivo: z.string(),
  }),
  z.object({
    tipo: z.literal('espera'),
    ms: z.number().int().positive().max(10_000),
  }),
]);

export type AcaoCenario = z.infer<typeof acaoCenarioSchema>;

export const cenarioSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  /** Emoji ou nome de ícone exibido no botão. */
  icone: z.string().optional(),
  acoes: z.array(acaoCenarioSchema).min(1),
});

export type Cenario = z.infer<typeof cenarioSchema>;

export const arquivoCenariosSchema = z.object({
  cenarios: z.array(cenarioSchema).default([]),
});

export type ArquivoCenarios = z.infer<typeof arquivoCenariosSchema>;

/** Resultado da execução de um cenário, ação por ação. */
export const resultadoCenarioSchema = z.object({
  cenarioId: z.string(),
  ts: z.number(),
  ok: z.boolean(),
  acoes: z.array(
    z.object({
      indice: z.number().int(),
      descricao: z.string(),
      ok: z.boolean(),
      erro: z.string().optional(),
    }),
  ),
});

export type ResultadoCenario = z.infer<typeof resultadoCenarioSchema>;
