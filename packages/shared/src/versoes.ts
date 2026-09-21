import { z } from 'zod';

/**
 * Versão é o commit instalado na máquina, lido de `versao.txt` (o instalador e
 * o atualizador escrevem ali "<sha> <notas>"). O `package.json` continua
 * existindo, mas ele muda pouco — quem diz "esta máquina está velha" é o sha.
 */
export const versaoInstaladaSchema = z.object({
  sha: z.string(),
  notas: z.string().default(''),
});

export type VersaoInstalada = z.infer<typeof versaoInstaladaSchema>;

/** Fases pelas quais o atualizador passa; a tela mostra isso ao vivo. */
export const ESTADOS_ATUALIZACAO = [
  'parado',
  'baixando',
  'compilando',
  'trocando',
  'ok',
  'falhou',
] as const;

export const estadoAtualizacaoSchema = z.object({
  estado: z.enum(ESTADOS_ATUALIZACAO),
  sha: z.string().optional(),
  mensagem: z.string().default(''),
  ts: z.number(),
});

export type EstadoAtualizacao = z.infer<typeof estadoAtualizacaoSchema>;

export const versaoDisponivelSchema = z.object({
  sha: z.string(),
  notas: z.string().default(''),
  data: z.string().optional(),
  /** A versão marcada como aprovada no canal (`npm run publicar`). */
  aprovada: z.boolean().default(false),
});

export type VersaoDisponivel = z.infer<typeof versaoDisponivelSchema>;

export const maquinaVersaoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  online: z.boolean(),
  /** null quando o agente não respondeu ou não sabe a própria versão. */
  sha: z.string().nullable().default(null),
  notas: z.string().default(''),
  /** true na máquina que roda o painel — atualizar ela derruba o painel por um minuto. */
  ehMaquinaDoHub: z.boolean().default(false),
  atualizacao: estadoAtualizacaoSchema.optional(),
});

export type MaquinaVersao = z.infer<typeof maquinaVersaoSchema>;

export const respostaVersoesSchema = z.object({
  aprovada: versaoDisponivelSchema.nullable(),
  disponiveis: z.array(versaoDisponivelSchema).default([]),
  maquinas: z.array(maquinaVersaoSchema).default([]),
  /** Preenchido quando o hub não conseguiu falar com o GitHub. */
  avisoRede: z.string().optional(),
});

export type RespostaVersoes = z.infer<typeof respostaVersoesSchema>;

export const pedidoAtualizacaoSchema = z.object({
  /** id do dispositivo, ou "hub" para a máquina que roda o painel. */
  alvo: z.string().min(1),
  sha: z.string().min(7),
  notas: z.string().default(''),
});

export type PedidoAtualizacao = z.infer<typeof pedidoAtualizacaoSchema>;

export const ALVO_HUB = 'hub';
