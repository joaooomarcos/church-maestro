import { z } from 'zod';
import { ACOES_APP, APLICATIVOS } from './dispositivos.js';
import { estadoAtualizacaoSchema } from './versoes.js';

/**
 * Janela que está na frente na máquina. Serve para a equipe saber, sem ir até
 * lá, se o que está aparecendo no datashow é o que deveria — e é o que o
 * controle por setas precisa para mandar a tecla ao lugar certo.
 */
export const janelaPrimeiroPlanoSchema = z.object({
  /** Nome do processo, minúsculo e sem `.exe`. */
  processo: z.string(),
  titulo: z.string().default(''),
  /** Preenchido quando o processo é um dos aplicativos conhecidos. */
  app: z.enum(APLICATIVOS).nullable().default(null),
});

export type JanelaPrimeiroPlano = z.infer<typeof janelaPrimeiroPlanoSchema>;

export const comandoAppSchema = z.object({
  app: z.enum(APLICATIVOS),
  acao: z.enum(ACOES_APP),
});

export type ComandoApp = z.infer<typeof comandoAppSchema>;

/** Seta do teclado para um programa da máquina — o controle do convidado. */
export const comandoTeclaSchema = z.object({
  app: z.enum(APLICATIVOS),
  direcao: z.enum(['proximo', 'anterior']),
});

/**
 * Um monitor da máquina. O aviso precisa abrir na tela de quem opera — nunca
 * no telão nem na que o NDI Screen Capture transmite.
 */
export const monitorSchema = z.object({
  /** Nome do Windows para a tela, ex.: `\\.\DISPLAY2`. Estável entre reinícios. */
  id: z.string().min(1),
  principal: z.boolean(),
  largura: z.number().int(),
  altura: z.number().int(),
});

export type Monitor = z.infer<typeof monitorSchema>;

/** Aviso na tela da máquina: janela por cima de tudo, até alguém clicar em "Ok". */
export const comandoAvisoSchema = z.object({
  mensagem: z.string().trim().min(1).max(300),
  /** id do monitor; ausente ou null = o principal. */
  monitor: z.string().nullable().optional(),
  /** Fecha sozinho depois de tantos segundos; ausente ou null = fica até alguém clicar em "Ok". */
  segundos: z.number().int().min(1).max(600).nullable().optional(),
});

export type ComandoAviso = z.infer<typeof comandoAvisoSchema>;

/** Um aplicativo conhecido na máquina: está aberto? o agente sabe abri-lo? */
export const situacaoAppSchema = z.object({
  app: z.enum(APLICATIVOS),
  aberto: z.boolean(),
  /** null = o agente não achou o executável; o assistente pode perguntar. */
  caminho: z.string().nullable().default(null),
});

export type SituacaoApp = z.infer<typeof situacaoAppSchema>;

/**
 * Contrato entre o agente local e o hub. O agente se anuncia sozinho a cada
 * poucos segundos — assim o hub encontra a máquina mesmo se o IP mudar, sem
 * depender só da varredura de rede.
 */
export const heartbeatAgenteSchema = z.object({
  /** Slug do dispositivo, definido na config do agente. */
  dispositivoId: z.string().min(1),
  hostname: z.string(),
  versao: z.string(),
  /** Commit instalado (de versao.txt). É o que o painel compara entre as máquinas. */
  versaoSha: z.string().optional(),
  versaoNotas: z.string().optional(),
  so: z.enum(['windows', 'linux', 'darwin']),
  /** IPv4 das interfaces não-loopback, para o hub saber onde responder. */
  ips: z.array(z.string()).default([]),
  /** Endereço físico da placa de rede principal, para o hub poder acordar a máquina. */
  mac: z.string().optional(),
  porta: z.number().int().positive(),
  uptimeS: z.number(),
  processos: z.record(z.enum(APLICATIVOS), z.boolean()).default({}),
  emPrimeiroPlano: janelaPrimeiroPlanoSchema.nullable().default(null),
  /**
   * Programas que esta máquina tem instalados (caminho conhecido). Ausente
   * quando o agente é antigo ou ainda está procurando — aí a tela mostra todos.
   */
  appsInstalados: z.array(z.enum(APLICATIVOS)).optional(),
  /** Ausente em agente antigo ou fora do Windows. */
  monitores: z.array(monitorSchema).optional(),
  capacidades: z.array(z.enum(['powerpoint', 'abrir-app', 'desligar'])).default([]),
});

export type HeartbeatAgente = z.infer<typeof heartbeatAgenteSchema>;

export const saudeAgenteSchema = heartbeatAgenteSchema.extend({
  ts: z.number(),
  /** Presente enquanto uma atualização estiver em andamento (ou logo depois dela). */
  atualizacao: estadoAtualizacaoSchema.optional(),
});

export const pedidoAtualizarAgenteSchema = z.object({
  sha: z.string().min(7),
  notas: z.string().default(''),
});

export type SaudeAgente = z.infer<typeof saudeAgenteSchema>;

export const statusPptSchema = z.object({
  /** false quando o PowerPoint está aberto mas ninguém iniciou a apresentação. */
  emApresentacao: z.boolean(),
  slide: z.number().int().nullable(),
  totalSlides: z.number().int().nullable(),
  arquivo: z.string().nullable(),
});

export type StatusPpt = z.infer<typeof statusPptSchema>;

export const comandoPptSchema = z.discriminatedUnion('acao', [
  z.object({ acao: z.literal('proximo') }),
  z.object({ acao: z.literal('anterior') }),
  z.object({ acao: z.literal('irPara'), slide: z.number().int().positive() }),
  z.object({ acao: z.literal('iniciar') }),
  z.object({ acao: z.literal('encerrar') }),
]);

export type ComandoPpt = z.infer<typeof comandoPptSchema>;

export const configAgenteSchema = z.object({
  dispositivoId: z.string().min(1),
  /** URL do hub, ex.: "http://192.168.0.10:8700". Vazio desliga o heartbeat. */
  hubUrl: z.string().url().optional(),
  porta: z.number().int().positive().default(8770),
  /** Segredo compartilhado com o hub. Sem ele, o agente recusa comandos. */
  token: z.string().min(8),
  intervaloHeartbeatMs: z.number().int().positive().default(10_000),
  /** Caminhos informados à mão, quando o agente não achou o programa sozinho. */
  caminhosApps: z.record(z.string(), z.string()).default({}),
});

export type ConfigAgente = z.infer<typeof configAgenteSchema>;
