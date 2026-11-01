import { z } from 'zod';
import { ACOES_APP, APLICATIVOS, urlPaginaSchema } from './dispositivos.js';

/**
 * Rotina "ao ligar" de uma máquina: o que o agente faz sozinho quando ela liga,
 * sem depender do hub. Só passos que a própria máquina consegue cumprir; o que
 * mexe em outra máquina, no OBS ou no painel continua sendo coisa de cenário.
 */

/** Espera padrão entre a máquina ligar e a rotina rodar: dá tempo de o Windows terminar de subir. */
export const ESPERA_AO_LIGAR_PADRAO_S = 30;

/** Espera máxima de um passo "Esperar": 5 minutos. */
export const ESPERA_PASSO_MAX_MS = 5 * 60_000;

/** Quanto o passo "Abrir" espera o programa ficar pronto, se ninguém mudar. */
export const ESPERA_PRONTO_PADRAO_S = 60;

export const passoAoLigarSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('app.acao'),
    app: z.enum(APLICATIVOS),
    /** "abrir" não abre uma segunda cópia se o programa já estiver aberto. */
    acao: z.enum(ACOES_APP),
    /** Só para abrir/reiniciar: espera o programa ficar pronto; se não ficar, o resto da rotina não roda. */
    esperarPronto: z.boolean().optional(),
    esperaMaxSegundos: z.number().int().min(5).max(600).optional(),
  }),
  z.object({
    tipo: z.literal('aviso'),
    mensagem: z.string().trim().min(1).max(300),
    /** id do monitor; ausente ou null = o principal. */
    monitor: z.string().nullable().optional(),
    /** Fecha sozinho depois de tantos segundos; null = até alguém clicar em "Ok". */
    segundos: z.number().int().min(1).max(600).nullable().default(null),
  }),
  z.object({
    tipo: z.literal('ndi.definirFonte'),
    /** Porta da janela do Studio Monitor desta máquina (80 = primeira janela). */
    porta: z.number().int().positive().default(80),
    /** Nome exato da fonte NDI, ou null para "None". */
    fonte: z.string().nullable(),
  }),
  z.object({
    tipo: z.literal('chrome.abrir'),
    url: urlPaginaSchema,
  }),
  z.object({ tipo: z.literal('holyrics.f8'), ativar: z.boolean() }),
  z.object({ tipo: z.literal('holyrics.encerrarApresentacao') }),
  z.object({ tipo: z.literal('espera'), ms: z.number().int().positive().max(ESPERA_PASSO_MAX_MS) }),
]);

export type PassoAoLigar = z.infer<typeof passoAoLigarSchema>;

export const rotinaAoLigarSchema = z.object({
  /** Desligada, a rotina não roda no boot (o botão "Testar agora" continua valendo). */
  ativo: z.boolean().default(false),
  esperaSegundos: z.number().int().min(0).max(600).default(ESPERA_AO_LIGAR_PADRAO_S),
  passos: z.array(passoAoLigarSchema).default([]),
});

export type RotinaAoLigar = z.infer<typeof rotinaAoLigarSchema>;

/** De onde veio a execução: o boot da máquina ou o botão "Testar agora". */
export const ORIGENS_AO_LIGAR = ['boot', 'teste'] as const;

export const execucaoAoLigarSchema = z.object({
  ts: z.number(),
  origem: z.enum(ORIGENS_AO_LIGAR),
  ok: z.boolean(),
  passos: z.array(
    z.object({
      descricao: z.string(),
      ok: z.boolean(),
      erro: z.string().optional(),
      /** Não rodou porque um passo anterior com "esperar ficar pronto" não ficou pronto. */
      pulado: z.boolean().optional(),
    }),
  ),
});

export type ExecucaoAoLigar = z.infer<typeof execucaoAoLigarSchema>;

/** O que o agente devolve (e o hub repassa): a rotina e como foi a última vez. */
export const respostaAoLigarSchema = z.object({
  rotina: rotinaAoLigarSchema,
  ultimaExecucao: execucaoAoLigarSchema.nullable().default(null),
  /** Há uma execução em andamento (espera ou passos) neste momento. */
  executando: z.boolean().default(false),
});

export type RespostaAoLigar = z.infer<typeof respostaAoLigarSchema>;

/** Caminhos do agente. Os de `/controle` só abrem na própria máquina; os de `/ao-ligar`, com o token dos agentes. */
export const CAMINHOS_AO_LIGAR = {
  rotina: '/ao-ligar',
  testar: '/ao-ligar/testar',
} as const;

export const CAMINHOS_AO_LIGAR_LOCAL = {
  rotina: '/controle/ao-ligar',
  testar: '/controle/ao-ligar/testar',
} as const;
