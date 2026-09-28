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

/** O que o painel pode mandar o agente fazer com um aplicativo da máquina. */
export const ACOES_APP = ['abrir', 'fechar', 'reiniciar', 'frente'] as const;

export type AcaoApp = (typeof ACOES_APP)[number];

/** Nome de cada aplicativo como a equipe o chama, para mensagens e botões. */
export const NOMES_APLICATIVOS: Record<Aplicativo, string> = {
  obs: 'OBS',
  holyrics: 'Holyrics',
  powerpoint: 'PowerPoint',
  'ndi-studio-monitor': 'NDI Studio Monitor',
  'ndi-screen-capture': 'NDI Screen Capture',
};

/**
 * Deixa o nome do processo só com letras e números, em minúsculas: é assim que
 * ele é comparado com os pedaços de `PROCESSOS_POR_APLICATIVO`.
 */
export function normalizarNomeProcesso(nome: string): string {
  return nome.toLowerCase().replace(/\.exe$/, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Pedaços do nome do processo de cada aplicativo, já normalizados (veja
 * `normalizarNomeProcesso`). O NDI Tools registra nomes como
 * "Application.Network.StudioMonitor.x64", e o Screen Capture ainda usa o nome
 * antigo da NDI: "Application.Network.ScanConverter2.x64".
 */
export const PROCESSOS_POR_APLICATIVO: Record<Aplicativo, string[]> = {
  obs: ['obs64', 'obs', 'obsstudio'],
  holyrics: ['holyrics', 'javaw'],
  powerpoint: ['powerpnt'],
  'ndi-studio-monitor': ['studiomonitor', 'videomonitor'],
  'ndi-screen-capture': ['scanconverter', 'screencapture'],
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
  /** Segredo do link de convidado desta máquina (o QR code). */
  tokenConvidado: z.string().optional(),
  /** Monitor onde os avisos aparecem (id de `Monitor`). Ausente = o principal. */
  monitorAvisos: z.string().optional(),
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
