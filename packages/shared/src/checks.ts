import { z } from 'zod';

/**
 * Um teste nunca devolve só "passou/falhou": devolve a cadeia inteira, para a
 * pessoa ver *onde* quebrou e o que fazer. É o ponto do projeto — quem está
 * operando muda toda semana e não tem como adivinhar.
 */
export const statusPassoSchema = z.enum(['ok', 'falha', 'aviso', 'pulado']);
export type StatusPasso = z.infer<typeof statusPassoSchema>;

export const passoCheckSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  status: statusPassoSchema,
  /** O que foi observado, em português, pronto para aparecer na tela. */
  detalhe: z.string(),
  /** Instrução concreta quando falha. Ex.: "Abra o Holyrics no Note Frente." */
  comoResolver: z.string().optional(),
  duracaoMs: z.number().optional(),
});

export type PassoCheck = z.infer<typeof passoCheckSchema>;

export const resultadoCheckSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  ts: z.number(),
  status: statusPassoSchema,
  resumo: z.string(),
  passos: z.array(passoCheckSchema),
});

export type ResultadoCheck = z.infer<typeof resultadoCheckSchema>;

/** Status geral de um check é o pior status entre seus passos. */
export function consolidarStatus(passos: PassoCheck[]): StatusPasso {
  if (passos.some((p) => p.status === 'falha')) return 'falha';
  if (passos.some((p) => p.status === 'aviso')) return 'aviso';
  if (passos.length > 0 && passos.every((p) => p.status === 'pulado')) return 'pulado';
  return 'ok';
}
