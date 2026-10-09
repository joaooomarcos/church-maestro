import { z } from 'zod';

/**
 * Um teste nunca devolve só "passou/falhou": devolve a cadeia inteira, para a
 * pessoa ver *onde* quebrou e o que fazer. É o ponto do projeto — quem está
 * operando muda toda semana e não tem como adivinhar.
 */
export const statusPassoSchema = z.enum(['ok', 'falha', 'aviso', 'pulado']);
export type StatusPasso = z.infer<typeof statusPassoSchema>;

/**
 * Correção que dá para fazer com um toque, sugerida por um passo que falhou.
 * Hoje só existe uma: clicar em "Atualizar" numa fonte web do OBS.
 */
export const acaoCheckSchema = z.object({
  tipo: z.literal('atualizar-fonte-obs'),
  /** id do dispositivo com o OBS. */
  dispositivo: z.string(),
  fonte: z.string(),
  /** id da máquina do Holyrics daquela fonte: se ela tiver algo no ar, a tela pede confirmação. */
  holyrics: z.string().optional(),
  rotulo: z.string(),
});

export type AcaoCheck = z.infer<typeof acaoCheckSchema>;

/** Print que um passo guardou como prova, para a tela mostrar (ex.: origem x destino do NDI). */
export const imagemCheckSchema = z.object({
  rotulo: z.string(),
  /** `data:image/jpeg;base64,...` — vive só na memória do hub e na resposta. */
  dataUrl: z.string(),
});

export type ImagemCheck = z.infer<typeof imagemCheckSchema>;

export const passoCheckSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  status: statusPassoSchema,
  /** O que foi observado, em português, pronto para aparecer na tela. */
  detalhe: z.string(),
  /** Instrução concreta quando falha. Ex.: "Abra o Holyrics no Note Frente." */
  comoResolver: z.string().optional(),
  duracaoMs: z.number().optional(),
  /** Rótulo para agrupar passos na tela (ex.: o nome da máquina). */
  grupo: z.string().optional(),
  /** Correção que a tela pode oferecer como botão. */
  acao: acaoCheckSchema.optional(),
  /** Prints que sustentam o veredito, na ordem em que a tela deve mostrar. */
  imagens: z.array(imagemCheckSchema).optional(),
});

export type PassoCheck = z.infer<typeof passoCheckSchema>;

export const resultadoCheckSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  ts: z.number(),
  status: statusPassoSchema,
  resumo: z.string(),
  passos: z.array(passoCheckSchema),
  /**
   * Presente quando o teste se recusou a rodar por segurança (culto em
   * andamento, OBS no ar…). `podeForcar` diz se o botão "Forçar teste" vale.
   */
  bloqueio: z.object({ motivo: z.string(), podeForcar: z.boolean() }).optional(),
});

export type ResultadoCheck = z.infer<typeof resultadoCheckSchema>;

/** Status geral de um check é o pior status entre seus passos. */
export function consolidarStatus(passos: PassoCheck[]): StatusPasso {
  if (passos.some((p) => p.status === 'falha')) return 'falha';
  if (passos.some((p) => p.status === 'aviso')) return 'aviso';
  if (passos.length > 0 && passos.every((p) => p.status === 'pulado')) return 'pulado';
  return 'ok';
}
