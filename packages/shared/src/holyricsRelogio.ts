import { z } from 'zod';

/**
 * Relógio que o Holyrics desenha por cima do papel de parede (Configurações ›
 * Papel de parede › Relógio). A API mexe nele por `SetWallpaperSettings`.
 */
export const POSICOES_RELOGIO = [
  'top_left',
  'top_center',
  'top_right',
  'middle_left',
  'middle_center',
  'middle_right',
  'bottom_left',
  'bottom_center',
  'bottom_right',
] as const;

export type PosicaoRelogio = (typeof POSICOES_RELOGIO)[number];

export const NOMES_POSICOES_RELOGIO: Record<PosicaoRelogio, string> = {
  top_left: 'Em cima, à esquerda',
  top_center: 'Em cima, no meio',
  top_right: 'Em cima, à direita',
  middle_left: 'No meio, à esquerda',
  middle_center: 'No centro',
  middle_right: 'No meio, à direita',
  bottom_left: 'Embaixo, à esquerda',
  bottom_center: 'Embaixo, no meio',
  bottom_right: 'Embaixo, à direita',
};

/** Tamanhos que o Holyrics aceita: % da altura da linha. */
export const TAMANHOS_RELOGIO = [6, 7, 8, 9, 10, 12, 14, 15, 16, 18, 20, 25, 30, 35, 40] as const;

export const estadoRelogioSchema = z.object({
  mostrar: z.boolean(),
  posicao: z.enum(POSICOES_RELOGIO).nullable(),
  tamanho: z.number().nullable(),
});

export type EstadoRelogio = z.infer<typeof estadoRelogioSchema>;

/** Só o que vier preenchido muda. */
export const pedidoRelogioSchema = z
  .object({
    dispositivo: z.string().min(1),
    mostrar: z.boolean().optional(),
    posicao: z.enum(POSICOES_RELOGIO).optional(),
    tamanho: z
      .number()
      .refine((n) => (TAMANHOS_RELOGIO as readonly number[]).includes(n), 'tamanho que o Holyrics não aceita')
      .optional(),
  })
  .refine((p) => p.mostrar !== undefined || p.posicao !== undefined || p.tamanho !== undefined, 'nada para mudar');

export type PedidoRelogio = z.infer<typeof pedidoRelogioSchema>;
export type MudancaRelogio = Omit<PedidoRelogio, 'dispositivo'>;
