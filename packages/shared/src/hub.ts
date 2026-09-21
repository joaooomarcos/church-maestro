import { z } from 'zod';
import {
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
  ndiFonte: '/api/ndi/fonte',
  holyricsAcao: '/api/holyrics/acao',
  pptAcao: '/api/powerpoint/acao',
  cenarios: '/api/cenarios',
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
  acao: z.enum(['proximo', 'anterior', 'irPara', 'encerrar', 'f8', 'f9', 'f10']),
  indice: z.number().int().nonnegative().optional(),
  ativar: z.boolean().optional(),
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
