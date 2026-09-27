import { z } from 'zod';

/**
 * Área de transferência da igreja: alguém cola um texto ou arquivo do celular e
 * outra pessoa pega no PC (ou o contrário). Um item só — colar de novo
 * substitui — e nada sobrevive a um reinício do hub.
 */
export const CAMINHO_COMPARTILHAR = '/compartilhar';

export const LIMITE_ARQUIVO_BYTES = 100 * 1024 * 1024;
export const LIMITE_TEXTO_CARACTERES = 100_000;

export const itemCompartilhadoSchema = z
  .discriminatedUnion('tipo', [
    z.object({
      tipo: z.literal('texto'),
      texto: z.string(),
      criadoEm: z.number(),
    }),
    z.object({
      tipo: z.literal('arquivo'),
      nome: z.string(),
      tamanho: z.number().int().nonnegative(),
      criadoEm: z.number(),
    }),
  ])
  .nullable();

export type ItemCompartilhado = z.infer<typeof itemCompartilhadoSchema>;

export const colarTextoSchema = z.object({
  texto: z.string().min(1).max(LIMITE_TEXTO_CARACTERES),
});

export const respostaLinkCompartilharSchema = z.object({ url: z.string() });
