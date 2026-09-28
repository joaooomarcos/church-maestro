import { z } from 'zod';
import { ACOES_APP, APLICATIVOS } from './dispositivos.js';

/**
 * Um cenário é uma lista de ações declarativas que põe a operação inteira num
 * estado conhecido com um toque. É o antídoto direto para "cada semana sai de
 * um jeito": em vez de lembrar sete passos, a pessoa aperta "Louvor".
 */
export const acaoCenarioSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('ndi.definirFonte'),
    /** id do dispositivo que roda o Studio Monitor. */
    dispositivo: z.string(),
    /** Porta da janela do Studio Monitor (80 = primeira janela). */
    porta: z.number().int().positive().default(80),
    /** Nome exato da fonte NDI, ou null para "None". */
    fonte: z.string().nullable(),
  }),
  z.object({
    tipo: z.literal('obs.definirCena'),
    dispositivo: z.string(),
    cena: z.string(),
  }),
  z.object({
    tipo: z.literal('holyrics.f8'),
    dispositivo: z.string(),
    ativar: z.boolean(),
  }),
  z.object({
    tipo: z.literal('holyrics.encerrarApresentacao'),
    dispositivo: z.string(),
  }),
  z.object({
    tipo: z.literal('app.acao'),
    dispositivo: z.string(),
    app: z.enum(APLICATIVOS),
    /** "abrir" não abre uma segunda cópia se o programa já estiver aberto. */
    acao: z.enum(ACOES_APP),
  }),
  z.object({
    tipo: z.literal('aviso.mostrar'),
    /** Máquinas onde a janela de aviso aparece. Pode ficar vazio se `noPainel`. */
    dispositivos: z.array(z.string()).default([]),
    mensagem: z.string().trim().min(1).max(300),
    /** Também mostra no painel de quem estiver com o celular aberto. */
    noPainel: z.boolean().default(true),
  }),
  z.object({
    tipo: z.literal('espera'),
    ms: z.number().int().positive().max(10_000),
  }),
]);

export type AcaoCenario = z.infer<typeof acaoCenarioSchema>;

export const cenarioSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().optional(),
  /** Emoji ou nome de ícone exibido no botão. */
  icone: z.string().optional(),
  acoes: z.array(acaoCenarioSchema).min(1),
});

export type Cenario = z.infer<typeof cenarioSchema>;

export const arquivoCenariosSchema = z.object({
  cenarios: z.array(cenarioSchema).default([]),
});

export type ArquivoCenarios = z.infer<typeof arquivoCenariosSchema>;

/** Resultado da execução de um cenário, ação por ação. */
export const resultadoCenarioSchema = z.object({
  cenarioId: z.string(),
  ts: z.number(),
  ok: z.boolean(),
  acoes: z.array(
    z.object({
      indice: z.number().int(),
      descricao: z.string(),
      ok: z.boolean(),
      erro: z.string().optional(),
    }),
  ),
});

export type ResultadoCenario = z.infer<typeof resultadoCenarioSchema>;

/** Criar ou editar: sem `id`, o hub gera um a partir do nome. */
export const salvarCenarioSchema = cenarioSchema.extend({ id: z.string().min(1).optional() });

export type CenarioParaSalvar = z.infer<typeof salvarCenarioSchema>;

/** Domingo = 0, como o `Date.getDay()` do JavaScript. */
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;

/**
 * Agendamento semanal de um cenário: "todo domingo às 18:50, Pré-culto". Roda
 * no relógio da máquina do hub, e só se ela estiver ligada naquela hora.
 */
export const agendamentoSchema = z.object({
  id: z.string().min(1),
  cenarioId: z.string().min(1),
  dias: z.array(z.number().int().min(0).max(6)).min(1),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora no formato HH:MM'),
  ativo: z.boolean().default(true),
});

export type Agendamento = z.infer<typeof agendamentoSchema>;

export const arquivoAutomacoesSchema = z.object({
  /** Liga/desliga geral: desligado, nenhum agendamento roda. */
  ativo: z.boolean().default(true),
  agendamentos: z.array(agendamentoSchema).default([]),
});

export type ArquivoAutomacoes = z.infer<typeof arquivoAutomacoesSchema>;

export const execucaoAgendadaSchema = z.object({
  agendamentoId: z.string(),
  cenarioId: z.string(),
  cenarioNome: z.string(),
  ts: z.number(),
  ok: z.boolean(),
  resumo: z.string(),
});

export type ExecucaoAgendada = z.infer<typeof execucaoAgendadaSchema>;

export const respostaAutomacoesSchema = arquivoAutomacoesSchema.extend({
  historico: z.array(execucaoAgendadaSchema).default([]),
  /** Próxima execução de cada agendamento ativo (timestamp), para a tela mostrar. */
  proximas: z.record(z.string(), z.number()).default({}),
});

export type RespostaAutomacoes = z.infer<typeof respostaAutomacoesSchema>;
