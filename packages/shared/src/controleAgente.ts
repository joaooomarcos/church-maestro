import { z } from 'zod';
import { MODOS_CONVIDADO } from './convidado.js';

/**
 * Tela de controle do agente: uma janela no próprio PC (http://localhost:<porta>/controle)
 * com o QR code dos links fixos desta máquina e os botões de NDI dela. O QR leva
 * o PIN junto, então quem escaneia já entra controlando.
 */

/** Caminhos servidos pelo agente. Só respondem para a própria máquina. */
export const CAMINHOS_CONTROLE_AGENTE = {
  pagina: '/controle',
  estado: '/controle/estado',
  ndi: '/controle/ndi',
} as const;

/** O PIN vai depois do "#": o navegador não manda essa parte para o servidor nem para os logs. */
export function urlConvidadoComPin(url: string, pin: string): string {
  return `${url}#pin=${encodeURIComponent(pin)}`;
}

/** Lê o PIN que veio no QR (location.hash). */
export function pinDoEndereco(hash: string): string | null {
  const pin = new URLSearchParams(hash.replace(/^#/, '')).get('pin');
  return pin && /^\d{4,8}$/.test(pin) ? pin : null;
}

/** O que o hub devolve ao agente (autenticado pelo token dos agentes). */
export const respostaControleAgenteSchema = z.object({
  dispositivoNome: z.string(),
  links: z
    .array(
      z.object({
        id: z.string(),
        nome: z.string(),
        modo: z.enum(MODOS_CONVIDADO),
        /** Já com o PIN no "#". */
        url: z.string(),
      }),
    )
    .default([]),
  /** Portas das janelas do Studio Monitor desta máquina, como cadastradas no painel. */
  portasNdi: z.array(z.number().int().positive()).default([]),
});

export type RespostaControleAgente = z.infer<typeof respostaControleAgenteSchema>;

export const pedidoFonteNdiLocalSchema = z.object({
  porta: z.number().int().positive(),
  /** null = nenhuma fonte (janela sem imagem). */
  fonte: z.string().nullable(),
});
