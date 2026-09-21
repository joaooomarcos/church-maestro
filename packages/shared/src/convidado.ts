import { z } from 'zod';
import { APLICATIVOS } from './dispositivos.js';

/**
 * Controle de convidado: alguém que vai apresentar escaneia o QR code da
 * máquina onde a apresentação está aberta e passa os slides do próprio celular,
 * sem conhecer o PIN da equipe nem mexer no painel.
 */
export const MODOS_CONVIDADO = ['holyrics', 'powerpoint', 'teclado'] as const;

export type ModoConvidado = (typeof MODOS_CONVIDADO)[number];

export const NOMES_MODOS: Record<ModoConvidado, string> = {
  holyrics: 'Holyrics',
  powerpoint: 'PowerPoint',
  teclado: 'Setas do teclado',
};

export const entrarConvidadoSchema = z.object({
  token: z.string().min(8),
  pin: z.string().min(1),
});

export const acaoConvidadoSchema = z.object({
  modo: z.enum(MODOS_CONVIDADO),
  acao: z.enum(['proximo', 'anterior']),
  /** No modo teclado, qual programa deve receber a tecla. */
  app: z.enum(APLICATIVOS).optional(),
});

export type AcaoConvidado = z.infer<typeof acaoConvidadoSchema>;

export const estadoConvidadoSchema = z.object({
  dispositivoNome: z.string(),
  /** Modos que fazem sentido nesta máquina agora. */
  modos: z.array(z.enum(MODOS_CONVIDADO)).default([]),
  /** Texto curto do que está no ar, para o convidado saber que acertou a máquina. */
  resumo: z.string().default(''),
  appsAbertos: z.array(z.enum(APLICATIVOS)).default([]),
});

export type EstadoConvidado = z.infer<typeof estadoConvidadoSchema>;

export const pedidoLinkConvidadoSchema = z.object({
  dispositivo: z.string().min(1),
  /** true gera um token novo e derruba os links antigos daquela máquina. */
  regerar: z.boolean().default(false),
});

export const respostaLinkConvidadoSchema = z.object({
  dispositivoId: z.string(),
  nome: z.string(),
  url: z.string(),
  pin: z.string(),
});

export type RespostaLinkConvidado = z.infer<typeof respostaLinkConvidadoSchema>;

/** Caminho da página que o QR code abre. O token identifica a máquina. */
export function caminhoConvidado(token: string): string {
  return `/convidado/${token}`;
}
