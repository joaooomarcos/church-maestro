import { z } from 'zod';
import { APLICATIVOS } from './dispositivos.js';

/**
 * Toda leitura de integração pode falhar sem que isso seja um erro do hub — a
 * máquina pode estar simplesmente desligada. Por isso todo bloco de estado
 * carrega `online` e `erro` em vez de sumir do snapshot.
 */
const baseIntegracao = {
  online: z.boolean(),
  erro: z.string().nullable().default(null),
};

export const estadoAgenteSchema = z.object({
  ...baseIntegracao,
  versao: z.string().optional(),
  so: z.enum(['windows', 'linux', 'darwin']).optional(),
  uptimeS: z.number().optional(),
  /** Um booleano por aplicativo conhecido. Ausente = agente não reportou. */
  processos: z.record(z.enum(APLICATIVOS), z.boolean()).default({}),
  capacidades: z.array(z.enum(['powerpoint', 'abrir-app', 'desligar'])).default([]),
});

export type EstadoAgente = z.infer<typeof estadoAgenteSchema>;

export const estadoPowerPointSchema = z.object({
  ...baseIntegracao,
  /** false = PowerPoint aberto mas fora do modo apresentação. */
  emApresentacao: z.boolean().default(false),
  slide: z.number().int().nullable().default(null),
  totalSlides: z.number().int().nullable().default(null),
  arquivo: z.string().nullable().default(null),
});

export type EstadoPowerPoint = z.infer<typeof estadoPowerPointSchema>;

export const apresentacaoHolyricsSchema = z.object({
  id: z.string(),
  /** Ver GetCurrentPresentation na API do Holyrics. */
  tipo: z.string(),
  nome: z.string(),
  slide: z.number().int().nullable(),
  totalSlides: z.number().int().nullable(),
  tipoSlide: z.string().nullable(),
});

export type ApresentacaoHolyrics = z.infer<typeof apresentacaoHolyricsSchema>;

export const estadoHolyricsSchema = z.object({
  ...baseIntegracao,
  /** null = conectado, porém sem nada sendo exibido. */
  apresentacao: apresentacaoHolyricsSchema.nullable().default(null),
});

export type EstadoHolyrics = z.infer<typeof estadoHolyricsSchema>;

export const estadoNdiMonitorSchema = z.object({
  ...baseIntegracao,
  /** Cada janela do Studio Monitor tem sua própria porta (80, 81, ...). */
  porta: z.number().int().positive(),
  /** null = "None" selecionado, ou seja, a janela não exibe nada. */
  fonteAtual: z.string().nullable().default(null),
  fontesDisponiveis: z.array(z.string()).default([]),
});

export type EstadoNdiMonitor = z.infer<typeof estadoNdiMonitorSchema>;

export const estadoObsSchema = z.object({
  ...baseIntegracao,
  cenaAtual: z.string().nullable().default(null),
  cenas: z.array(z.string()).default([]),
  transmitindo: z.boolean().default(false),
  gravando: z.boolean().default(false),
  tempoTransmissaoS: z.number().default(0),
  /** Zero enquanto não estiver transmitindo. */
  bitrateKbps: z.number().default(0),
  framesPerdidos: z.number().default(0),
  /** Percentual de frames perdidos — o número que realmente importa monitorar. */
  percFramesPerdidos: z.number().default(0),
});

export type EstadoObs = z.infer<typeof estadoObsSchema>;

export const estadoDispositivoSchema = z.object({
  id: z.string(),
  nome: z.string(),
  host: z.string(),
  /** true se qualquer integração da máquina respondeu na última varredura. */
  online: z.boolean(),
  ultimoContato: z.number().nullable().default(null),
  agente: estadoAgenteSchema.optional(),
  powerpoint: estadoPowerPointSchema.optional(),
  holyrics: estadoHolyricsSchema.optional(),
  ndi: z.array(estadoNdiMonitorSchema).default([]),
  obs: estadoObsSchema.optional(),
});

export type EstadoDispositivo = z.infer<typeof estadoDispositivoSchema>;

export const snapshotSchema = z.object({
  ts: z.number(),
  /** Sobe a cada mudança relevante; a UI usa para descartar mensagens fora de ordem. */
  revisao: z.number().int(),
  dispositivos: z.array(estadoDispositivoSchema),
  /** Serviços vistos na rede que ainda não pertencem a nenhum dispositivo. */
  naoIdentificados: z
    .array(z.object({ host: z.string(), porta: z.number(), tipo: z.string() }))
    .default([]),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

/** Mensagens que o hub empurra pelo WebSocket. */
export type MensagemHub =
  | { tipo: 'snapshot'; dados: Snapshot }
  | { tipo: 'check'; dados: import('./checks.js').ResultadoCheck }
  | { tipo: 'aviso'; nivel: 'info' | 'alerta' | 'erro'; texto: string };
