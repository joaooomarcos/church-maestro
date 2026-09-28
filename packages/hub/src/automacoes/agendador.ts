import type { Agendamento, ExecucaoAgendada } from '@maestro/shared';
import { executarCenario } from '../cenarios/executar.js';
import type { ContextoApp } from '../rotas/contexto.js';

const VERIFICAR_A_CADA_MS = 15_000;
/**
 * Até quanto tempo depois do horário ainda vale rodar. Cobre o hub que
 * reiniciou naquele minuto; não cobre a máquina ligada meia hora depois —
 * aí rodar o "Pré-culto" atrasado faria mais mal do que bem.
 */
export const TOLERANCIA_MS = 2 * 60_000;
const HISTORICO_MAXIMO = 20;

function horarioNoDia(dia: Date, hora: string): Date {
  const [horas, minutos] = hora.split(':').map(Number);
  const alvo = new Date(dia);
  alvo.setHours(horas ?? 0, minutos ?? 0, 0, 0);
  return alvo;
}

/** Data local (não UTC): o culto de domingo é domingo no relógio da igreja. */
export function chaveDoDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth() + 1}-${data.getDate()}`;
}

/** No dia certo, a partir do horário, dentro da tolerância, e uma vez só por dia. */
export function deveRodar(
  agendamento: Agendamento,
  agora: Date,
  ultimoDiaRodado: string | undefined,
): boolean {
  if (!agendamento.ativo) return false;
  if (!agendamento.dias.includes(agora.getDay())) return false;
  const passou = agora.getTime() - horarioNoDia(agora, agendamento.hora).getTime();
  if (passou < 0 || passou >= TOLERANCIA_MS) return false;
  return ultimoDiaRodado !== chaveDoDia(agora);
}

/** Próxima vez que o agendamento vai rodar, em até uma semana. */
export function proximaExecucao(agendamento: Agendamento, agora: Date): number | null {
  if (!agendamento.ativo) return null;
  for (let adiante = 0; adiante <= 7; adiante++) {
    const dia = new Date(agora);
    dia.setDate(agora.getDate() + adiante);
    if (!agendamento.dias.includes(dia.getDay())) continue;
    const alvo = horarioNoDia(dia, agendamento.hora);
    if (alvo.getTime() > agora.getTime()) return alvo.getTime();
  }
  return null;
}

export interface Agendador {
  iniciar(): void;
  parar(): void;
  historico(): ExecucaoAgendada[];
  /** Uma volta de verificação; exposta para os testes. */
  verificar(): Promise<void>;
}

/**
 * Confere os agendamentos a cada 15 s e roda os cenários da hora. O relógio é o
 * da máquina do hub: se ela estiver desligada na hora, o agendamento não roda.
 */
export function criarAgendador(ctx: ContextoApp, relogio: () => Date = () => new Date()): Agendador {
  const ultimoDiaRodado = new Map<string, string>();
  const historico: ExecucaoAgendada[] = [];
  let temporizador: NodeJS.Timeout | undefined;
  let verificando = false;

  async function verificar(): Promise<void> {
    if (verificando) return;
    const automacoes = ctx.automacoes();
    if (!automacoes.ativo) return;

    verificando = true;
    try {
      const agora = relogio();
      for (const agendamento of automacoes.agendamentos) {
        if (!deveRodar(agendamento, agora, ultimoDiaRodado.get(agendamento.id))) continue;
        ultimoDiaRodado.set(agendamento.id, chaveDoDia(agora));

        const cenario = ctx.cenarios().find((c) => c.id === agendamento.cenarioId);
        if (!cenario) continue;

        const resultado = await executarCenario(ctx, cenario);
        const falhas = resultado.acoes.filter((acao) => !acao.ok);
        const registro: ExecucaoAgendada = {
          agendamentoId: agendamento.id,
          cenarioId: cenario.id,
          cenarioNome: cenario.nome,
          ts: resultado.ts,
          ok: resultado.ok,
          resumo: resultado.ok
            ? `${resultado.acoes.length} passo(s) aplicados`
            : falhas.map((falha) => `${falha.descricao}: ${falha.erro ?? 'falhou'}`).join('; '),
        };
        historico.unshift(registro);
        historico.splice(HISTORICO_MAXIMO);

        ctx.store.transmitirMensagem({
          tipo: 'aviso',
          nivel: resultado.ok ? 'info' : 'alerta',
          texto: resultado.ok
            ? `Agendamento: "${cenario.nome}" aplicado.`
            : `Agendamento: "${cenario.nome}" teve falhas — ${registro.resumo}`,
        });
      }
    } finally {
      verificando = false;
    }
  }

  return {
    iniciar() {
      temporizador = setInterval(() => void verificar(), VERIFICAR_A_CADA_MS);
      void verificar();
    },
    parar() {
      if (temporizador) clearInterval(temporizador);
    },
    historico: () => [...historico],
    verificar,
  };
}
