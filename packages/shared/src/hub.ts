import { z } from 'zod';
import {
  ACOES_APP,
  APLICATIVOS,
  PORTAS_PADRAO,
  servicoHolyricsSchema,
  servicoNdiMonitorSchema,
  servicoObsSchema,
} from './dispositivos.js';

/** O que o hub responde em `GET /health`. É assim que o agente o reconhece na rede. */
export const SERVICO_HUB = 'maestro-hub';

export const configHubSchema = z.object({
  porta: z.number().int().positive().default(PORTAS_PADRAO.hub),
  /** PIN compartilhado da equipe. Trocar aqui invalida as sessões abertas. */
  pin: z.string().min(4),
  /** Segredo usado para assinar o cookie de sessão. Gerado na instalação. */
  segredoSessao: z.string().min(16),
  /** Token que o hub apresenta aos agentes, e vice-versa. */
  tokenAgentes: z.string().min(8),
  /**
   * De quanto em quanto tempo cada agente avisa que está vivo. Vale para todas
   * as máquinas: o hub devolve este valor em toda batida e o agente se ajusta.
   */
  intervaloHeartbeatMs: z.number().int().min(2000).max(120_000).default(10_000),
  /**
   * PIN da página do convidado (o QR code). Separado do PIN da equipe: quem vai
   * apresentar recebe só este, e ele não abre o painel.
   */
  pinConvidado: z
    .string()
    .min(4)
    .max(12)
    .default(() => String(Math.floor(1000 + Math.random() * 9000))),
  /** Sub-rede a varrer, ex.: "192.168.0.0/24". Vazio = detecta pela interface. */
  redeVarredura: z.string().optional(),
  intervaloPollingMs: z.number().int().positive().default(2000),
  varreduraAutomaticaMin: z.number().int().nonnegative().default(10),
});

export type ConfigHub = z.infer<typeof configHubSchema>;

/** Rotas da API, em um só lugar, para hub e web não divergirem. */
export const ROTAS = {
  login: '/api/login',
  logout: '/api/logout',
  sessao: '/api/sessao',
  saude: '/health',
  snapshot: '/api/snapshot',
  ws: '/api/ws',
  dispositivos: '/api/dispositivos',
  varredura: '/api/varredura',
  registrarAgente: '/api/agentes/registrar',
  pareamento: '/api/pareamento',
  versoes: '/api/versoes',
  atualizar: '/api/atualizar',
  appAcao: '/api/apps/acao',
  aviso: '/api/aviso',
  avisoFechar: '/api/aviso/fechar',
  monitorAvisos: '/api/dispositivos/:id/monitor-avisos',
  ajustes: '/api/ajustes',
  convidadoLink: '/api/convidado/link',
  convidadoEntrar: '/api/convidado/entrar',
  convidadoEstado: '/api/convidado/estado',
  convidadoAcao: '/api/convidado/acao',
  compartilhar: '/api/compartilhar',
  compartilharTexto: '/api/compartilhar/texto',
  compartilharArquivo: '/api/compartilhar/arquivo',
  compartilharLink: '/api/compartilhar/link',
  ndiFonte: '/api/ndi/fonte',
  holyricsAcao: '/api/holyrics/acao',
  holyricsPlaylist: '/api/holyrics/playlist',
  pptAcao: '/api/powerpoint/acao',
  cenarios: '/api/cenarios',
  cenario: '/api/cenarios/:id',
  automacoes: '/api/automacoes',
  executarCenario: '/api/cenarios/executar',
  checkLegendas: '/api/checks/legendas',
  checkNdi: '/api/checks/ndi',
} as const;

export const loginSchema = z.object({ pin: z.string().min(1) });

export const executarCenarioSchema = z.object({ cenarioId: z.string().min(1) });

export const definirFonteNdiSchema = z.object({
  dispositivo: z.string(),
  porta: z.number().int().positive().default(80),
  /** null seleciona "None" (janela sem fonte). */
  fonte: z.string().nullable(),
});

export const acaoHolyricsSchema = z.object({
  dispositivo: z.string(),
  acao: z.enum(['proximo', 'anterior', 'irPara', 'encerrar', 'f8', 'f9', 'f10', 'mostrarLetra']),
  indice: z.number().int().nonnegative().optional(),
  ativar: z.boolean().optional(),
  /** Id da música da lista de reprodução, para a ação "mostrarLetra". */
  letraId: z.string().min(1).optional(),
});

/** Uma música da lista de reprodução do Holyrics. */
export const itemPlaylistHolyricsSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  artista: z.string().optional(),
});

export type ItemPlaylistHolyrics = z.infer<typeof itemPlaylistHolyricsSchema>;

export const respostaPlaylistHolyricsSchema = z.object({
  itens: z.array(itemPlaylistHolyricsSchema).default([]),
});

export type RespostaPlaylistHolyrics = z.infer<typeof respostaPlaylistHolyricsSchema>;

/** Ajustes que a equipe pode mudar pelo painel, sem mexer em arquivo. */
export const ajustesSchema = z.object({
  intervaloHeartbeatMs: z.number().int().min(2000).max(120_000).optional(),
  pinConvidado: z.string().min(4).max(12).optional(),
});

export type Ajustes = z.infer<typeof ajustesSchema>;

export const acaoAppSchema = z.object({
  dispositivo: z.string(),
  app: z.enum(APLICATIVOS),
  acao: z.enum(ACOES_APP),
});

/** Mandar um aviso agora — o mesmo que o passo de cenário, usado pelo "Testar". */
/** No lugar do id de um monitor: mostra o aviso em todos os monitores da máquina. */
export const MONITOR_TODOS = '*';

export const pedidoAvisoSchema = z.object({
  dispositivos: z.array(z.string()).default([]),
  mensagem: z.string().trim().min(1).max(300),
  noPainel: z.boolean().default(false),
  /**
   * Em que monitor o aviso abre, por máquina (id do monitor, `MONITOR_TODOS` ou
   * null para o principal). Máquina que não aparece aqui usa o padrão dela, que
   * é o que os cenários agendados usam, já que ninguém escolhe na hora.
   */
  monitores: z.record(z.string(), z.string().nullable()).default({}),
  /** Fecha sozinho depois de tantos segundos; null = fica até alguém clicar em "Ok". */
  segundos: z.number().int().min(1).max(600).nullable().default(null),
});

/** Fecha os avisos que estiverem abertos nas máquinas (vazio = em todas). */
export const pedidoFecharAvisosSchema = z.object({
  dispositivos: z.array(z.string()).default([]),
});

export type PedidoAviso = z.infer<typeof pedidoAvisoSchema>;

export const definirMonitorAvisosSchema = z.object({
  /** null volta para o monitor principal. */
  monitor: z.string().min(1).nullable(),
});

export const acaoPptSchema = z.object({
  dispositivo: z.string(),
  acao: z.enum(['proximo', 'anterior', 'irPara', 'iniciar', 'encerrar']),
  slide: z.number().int().positive().optional(),
});

/**
 * Pareamento: o assistente do agente manda a máquina inteira já testada e o PIN
 * da equipe; o hub cadastra o dispositivo e devolve o token dos agentes. É o
 * PIN que impede qualquer aparelho do wi-fi de pedir o token.
 */
export const pedidoPareamentoSchema = z.object({
  pin: z.string().min(1),
  nome: z.string().min(1),
  /** id atual desta máquina, quando ela já era pareada — evita duplicar ao renomear. */
  dispositivoIdAnterior: z.string().optional(),
  host: z.string().min(1),
  porta: z.number().int().positive().default(PORTAS_PADRAO.agente),
  servicos: z
    .object({
      holyrics: servicoHolyricsSchema.optional(),
      ndiMonitor: servicoNdiMonitorSchema.optional(),
      obs: servicoObsSchema.optional(),
    })
    .default({}),
});

export type PedidoPareamento = z.infer<typeof pedidoPareamentoSchema>;

export const respostaPareamentoSchema = z.object({
  dispositivoId: z.string(),
  nome: z.string(),
  token: z.string(),
});

export type RespostaPareamento = z.infer<typeof respostaPareamentoSchema>;

/** Resposta de erro padrão. A `mensagem` vai direto para a tela, em português. */
export const erroApiSchema = z.object({
  erro: z.string(),
  mensagem: z.string(),
  detalhe: z.string().optional(),
});

export type ErroApi = z.infer<typeof erroApiSchema>;
