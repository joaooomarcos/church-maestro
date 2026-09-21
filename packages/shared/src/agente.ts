import { z } from 'zod';
import { APLICATIVOS } from './dispositivos.js';
import { estadoAtualizacaoSchema } from './versoes.js';

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
  porta: z.number().int().positive(),
  uptimeS: z.number(),
  processos: z.record(z.enum(APLICATIVOS), z.boolean()).default({}),
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
});

export type ConfigAgente = z.infer<typeof configAgenteSchema>;
