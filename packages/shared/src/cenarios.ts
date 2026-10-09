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
    /** Monitor por máquina (id, "*" para todos); sem escolha vale o padrão da máquina. */
    monitores: z.record(z.string(), z.string().nullable()).default({}),
    /** Fecha sozinho depois de tantos segundos; null = até alguém clicar em "Ok". */
    segundos: z.number().int().min(1).max(600).nullable().default(null),
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
  /** Ausente nos arquivos antigos: sem `tipo` é sempre um agendamento por horário. */
  tipo: z.literal('horario').optional(),
  cenarioId: z.string().min(1),
  dias: z.array(z.number().int().min(0).max(6)).min(1),
  hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'hora no formato HH:MM'),
  ativo: z.boolean().default(true),
});

export type Agendamento = z.infer<typeof agendamentoSchema>;

/** Espera padrão entre a máquina ligar e o cenário rodar: dá tempo de o Windows terminar de subir. */
export const ESPERA_AO_LIGAR_PADRAO_S = 30;

/**
 * "Quando <máquina> ligar, rode <cenário>": dispara quando o agente da máquina
 * passa de offline para online, depois de `esperaSegundos`.
 */
export const automacaoAoLigarSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal('aoLigar'),
  dispositivo: z.string().min(1),
  cenarioId: z.string().min(1),
  esperaSegundos: z.number().int().min(0).max(600).default(ESPERA_AO_LIGAR_PADRAO_S),
  ativo: z.boolean().default(true),
});

export type AutomacaoAoLigar = z.infer<typeof automacaoAoLigarSchema>;

/** Cada item da lista de automações: por horário (formato antigo) ou ao ligar uma máquina. */
export const automacaoSchema = z.union([automacaoAoLigarSchema, agendamentoSchema]);

export type Automacao = z.infer<typeof automacaoSchema>;

export function ehAoLigar(automacao: Automacao): automacao is AutomacaoAoLigar {
  return automacao.tipo === 'aoLigar';
}

export const arquivoAutomacoesSchema = z.object({
  /** Liga/desliga geral: desligado, nenhuma automação roda. */
  ativo: z.boolean().default(true),
  /** O nome do campo vem de quando só existiam agendamentos por horário; mantido para os arquivos antigos. */
  agendamentos: z.array(automacaoSchema).default([]),
});

export type ArquivoAutomacoes = z.infer<typeof arquivoAutomacoesSchema>;

/** De onde veio a execução: toque no cenário, horário marcado ou máquina que ligou. */
export const ORIGENS_EXECUCAO = ['manual', 'agendado', 'aoLigar'] as const;
export type OrigemExecucao = (typeof ORIGENS_EXECUCAO)[number];

/** Uma execução de cenário no histórico, qualquer que seja a origem. */
export const execucaoAgendadaSchema = z.object({
  /** Só nas execuções disparadas por uma automação. */
  agendamentoId: z.string().optional(),
  /** Ausente nos registros antigos, que eram sempre agendados. */
  origem: z.enum(ORIGENS_EXECUCAO).optional(),
  cenarioId: z.string(),
  cenarioNome: z.string(),
  ts: z.number(),
  ok: z.boolean(),
  resumo: z.string(),
  /** Resultado de cada passo, na ordem em que rodaram. */
  passos: z
    .array(z.object({ descricao: z.string(), ok: z.boolean(), erro: z.string().optional() }))
    .optional(),
});

export type ExecucaoAgendada = z.infer<typeof execucaoAgendadaSchema>;
export type ExecucaoCenario = ExecucaoAgendada;

/** Próxima execução por horário, já com o nome do cenário, para o card do Painel. */
export const proximoAgendamentoSchema = z.object({
  agendamentoId: z.string(),
  cenarioId: z.string(),
  cenarioNome: z.string(),
  /** Timestamp (ms) da próxima execução. */
  quando: z.number(),
});

export type ProximoAgendamento = z.infer<typeof proximoAgendamentoSchema>;

export const respostaAutomacoesSchema = arquivoAutomacoesSchema.extend({
  historico: z.array(execucaoAgendadaSchema).default([]),
  /** Próxima execução de cada agendamento por horário ativo (timestamp), para a tela mostrar. */
  proximas: z.record(z.string(), z.number()).default({}),
  /** A execução mais recente, de qualquer origem. */
  ultimaExecucao: execucaoAgendadaSchema.nullable().default(null),
  /** Até 2 próximos horários marcados; vale só se `ativo` (interruptor global) for true. */
  proximosAgendamentos: z.array(proximoAgendamentoSchema).default([]),
});

export type RespostaAutomacoes = z.infer<typeof respostaAutomacoesSchema>;
