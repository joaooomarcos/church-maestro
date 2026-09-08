import { z } from 'zod';

/**
 * Aplicativos que interessam para a operação do culto. O agente reporta quais
 * estão abertos; o checklist usa isso para marcar itens sozinho.
 */
export const APLICATIVOS = [
  'obs',
  'holyrics',
  'powerpoint',
  'ndi-studio-monitor',
  'ndi-screen-capture',
] as const;

export type Aplicativo = (typeof APLICATIVOS)[number];

/**
 * Nomes de processo por sistema operacional. O agente compara em minúsculas e
 * sem extensão, então `POWERPNT.EXE` casa com `powerpnt`.
 */
export const PROCESSOS_POR_APLICATIVO: Record<Aplicativo, string[]> = {
  obs: ['obs64', 'obs', 'obs-studio'],
  holyrics: ['holyrics', 'javaw'],
  powerpoint: ['powerpnt'],
  'ndi-studio-monitor': ['studio monitor', 'ndi studio monitor', 'video monitor'],
  'ndi-screen-capture': ['screen capture', 'ndi screen capture', 'screen capture hx'],
};

/** Portas padrão de cada integração. Servem de chute inicial na varredura. */
export const PORTAS_PADRAO = {
  /** Studio Monitor: 1ª janela na 80, 2ª na 81, e assim por diante. */
  ndiMonitor: [80, 81, 82],
  holyricsApi: 8091,
  obsWebsocket: 4455,
  agente: 8770,
  hub: 8700,
} as const;

export const servicoAgenteSchema = z.object({
  porta: z.number().int().positive().default(PORTAS_PADRAO.agente),
  token: z.string().optional(),
});

export const servicoHolyricsSchema = z.object({
  porta: z.number().int().positive().default(PORTAS_PADRAO.holyricsApi),
  token: z.string(),
  /**
   * URL da página de legendas que o OBS consome (o "servidor web" do Holyrics).
   * Usada no teste de legendas para confirmar que a página responde.
   */
  legendaUrl: z.string().url().optional(),
});

export const servicoNdiMonitorSchema = z.object({
  /** Uma porta por janela aberta do Studio Monitor. */
  portas: z.array(z.number().int().positive()).default([80]),
});

export const servicoObsSchema = z.object({
  porta: z.number().int().positive().default(PORTAS_PADRAO.obsWebsocket),
  senha: z.string().optional(),
  /** Nome da source de legenda no OBS, usada na prova real do teste. */
  sourceLegenda: z.string().optional(),
});

export const dispositivoConfigSchema = z.object({
  /** Slug estável, ex.: "note-frente". Nunca muda, mesmo se o IP mudar. */
  id: z.string().min(1),
  nome: z.string().min(1),
  /** Vazio enquanto o dispositivo não foi configurado nem se anunciou. */
  host: z.string().default(''),
  /** Quando true, o heartbeat do agente não sobrescreve o host configurado. */
  fixarHost: z.boolean().default(false),
  observacao: z.string().optional(),
  servicos: z
    .object({
      agente: servicoAgenteSchema.optional(),
      holyrics: servicoHolyricsSchema.optional(),
      ndiMonitor: servicoNdiMonitorSchema.optional(),
      obs: servicoObsSchema.optional(),
    })
    .default({}),
});

export type DispositivoConfig = z.infer<typeof dispositivoConfigSchema>;

export const arquivoDispositivosSchema = z.object({
  dispositivos: z.array(dispositivoConfigSchema).default([]),
});

export type ArquivoDispositivos = z.infer<typeof arquivoDispositivosSchema>;

/** Serviço encontrado pela varredura de rede, ainda não associado a um dispositivo. */
export const servicoDescobertoSchema = z.object({
  host: z.string(),
  porta: z.number().int().positive(),
  tipo: z.enum(['ndi-monitor', 'holyrics', 'obs', 'agente']),
  /** Nome que o próprio serviço informou, quando disponível. */
  identificacao: z.string().optional(),
  /** id do dispositivo já cadastrado que atende nesse host, se houver. */
  dispositivoId: z.string().optional(),
});

export type ServicoDescoberto = z.infer<typeof servicoDescobertoSchema>;
