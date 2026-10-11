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
  'rustdesk',
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
  rustdesk: 'RustDesk',
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
  rustdesk: ['rustdesk'],
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
  /**
   * Em que monitor da máquina cada janela aparece, por porta (a chave é a porta
   * como texto: "80", "81"…). Vem de Ajustes › NDI; o teste do NDI captura esse
   * monitor para comparar com o que a máquina de origem envia.
   */
  monitores: z.record(z.string(), z.string().min(1)).optional(),
});

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora no formato HH:MM');

/**
 * Faixa de horário em que o teste de legendas não roda (o culto, por exemplo).
 * `fim` menor que `inicio` atravessa a meia-noite.
 */
export const faixaHorarioSchema = z.object({
  /** 0 = domingo … 6 = sábado, como em `Date.getDay()`. */
  dias: z.array(z.number().int().min(0).max(6)).min(1),
  inicio: horaSchema,
  fim: horaSchema,
});

export type FaixaHorario = z.infer<typeof faixaHorarioSchema>;

/** Quais fontes web do OBS são de um Holyrics: uma no grupo da música, outra no da leitura. */
export const fontesLegendaHolyricsSchema = z.object({
  /** id do dispositivo que roda esse Holyrics. */
  dispositivo: z.string().min(1),
  fonteMusica: z.string().optional(),
  fonteLeitura: z.string().optional(),
});

export type FontesLegendaHolyrics = z.infer<typeof fontesLegendaHolyricsSchema>;

/**
 * Como a legenda está montada no OBS. O gatilho do Holyrics abre e fecha o
 * GRUPO inteiro (música ou leitura); a fonte web de cada Holyrics fica sempre
 * ligada dentro dele. Editado em Ajustes › Legendas.
 */
export const configLegendasSchema = z.object({
  /** Cena que contém os dois grupos (ex.: "Cena_Elementos"). */
  cena: z.string().optional(),
  grupoMusica: z.string().optional(),
  grupoLeitura: z.string().optional(),
  holyrics: z.array(fontesLegendaHolyricsSchema).default([]),
  /** Atualiza as fontes web daquele Holyrics no OBS quando ele liga (o caso "aberto depois do OBS"). */
  atualizarAoLigar: z.boolean().default(true),
  /** Faixas em que o teste não roda, para nunca exibir nada de teste durante o culto. */
  horariosProibidos: z.array(faixaHorarioSchema).default([]),
  /** Referência exibida no teste da leitura. */
  versiculo: z.string().min(1).default('Sl 23:1'),
});

export type ConfigLegendas = z.infer<typeof configLegendasSchema>;

export const servicoObsSchema = z.object({
  porta: z.number().int().positive().default(PORTAS_PADRAO.obsWebsocket),
  senha: z.string().optional(),
  /**
   * Formato antigo: uma fonte só. Continua valendo enquanto `legendas` não for
   * preenchido em Ajustes › Legendas.
   */
  sourceLegenda: z.string().optional(),
  legendas: configLegendasSchema.optional(),
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
  /** O que o link de convidado controla (holyrics, powerpoint ou teclado). Ausente = o convidado escolhe. */
  modoConvidado: z.enum(['holyrics', 'powerpoint', 'teclado']).optional(),
  /** O link temporário tem controle completo (lista de reprodução, tela preta, prévias). Ausente = não. */
  completoConvidado: z.boolean().optional(),
  /** Monitor onde os avisos aparecem (id de `Monitor`). Ausente = o principal. */
  monitorAvisos: z.string().optional(),
  /**
   * Monitor que o NDI Screen Capture desta máquina envia pela rede (id de
   * `Monitor`). Ausente = o principal, que é o padrão do Screen Capture.
   */
  monitorNdiEnvio: z.string().optional(),
  /**
   * Programas que esta máquina usa. Só eles aparecem no painel e em "Programas".
   * Ausente = ainda não foi escolhido: vale o que o agente achou instalado.
   */
  apps: z.array(z.enum(APLICATIVOS)).optional(),
  /** Endereço físico (MAC), aprendido do agente, para acordar a máquina pela rede. */
  mac: z.string().optional(),
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
