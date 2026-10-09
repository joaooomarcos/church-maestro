import type { Cenario, ExecucaoCenario, OrigemExecucao, ResultadoCenario } from '@maestro/shared';
import { executarCenario } from '../cenarios/executar.js';
import type { ContextoApp } from '../rotas/contexto.js';

export const HISTORICO_MAXIMO = 30;

/**
 * Um histórico por contexto: as rotas (toque manual) e as automações gravam no
 * mesmo lugar sem precisar passar o objeto de mão em mão. Fica em memória, como
 * o histórico dos agendamentos sempre foi — reiniciar o hub zera.
 */
const historicos = new WeakMap<ContextoApp, ExecucaoCenario[]>();

function listaDe(ctx: ContextoApp): ExecucaoCenario[] {
  let lista = historicos.get(ctx);
  if (!lista) {
    lista = [];
    historicos.set(ctx, lista);
  }
  return lista;
}

/** Da mais recente para a mais antiga. */
export function historicoDe(ctx: ContextoApp): ExecucaoCenario[] {
  return [...listaDe(ctx)];
}

export function ultimaExecucaoDe(ctx: ContextoApp): ExecucaoCenario | null {
  return listaDe(ctx)[0] ?? null;
}

export function registrarExecucao(
  ctx: ContextoApp,
  cenario: Cenario,
  resultado: ResultadoCenario,
  origem: OrigemExecucao,
  agendamentoId?: string,
): ExecucaoCenario {
  const falhas = resultado.acoes.filter((acao) => !acao.ok);
  const registro: ExecucaoCenario = {
    ...(agendamentoId ? { agendamentoId } : {}),
    origem,
    cenarioId: cenario.id,
    cenarioNome: cenario.nome,
    ts: resultado.ts,
    ok: resultado.ok,
    resumo: resultado.ok
      ? `${resultado.acoes.length} passo(s) aplicados`
      : falhas.map((falha) => `${falha.descricao}: ${falha.erro ?? 'falhou'}`).join('; '),
    passos: resultado.acoes.map(({ descricao, ok, erro }) => ({ descricao, ok, ...(erro ? { erro } : {}) })),
  };
  const lista = listaDe(ctx);
  lista.unshift(registro);
  lista.splice(HISTORICO_MAXIMO);
  // O painel atualiza o card de "última execução" sem esperar o próximo sorteio de dados.
  ctx.store.transmitirMensagem({ tipo: 'execucao', dados: registro });
  return registro;
}

/** Roda o cenário e deixa o rastro no histórico, não importa quem pediu. */
export async function executarERegistrar(
  ctx: ContextoApp,
  cenario: Cenario,
  origem: OrigemExecucao,
  agendamentoId?: string,
): Promise<{ resultado: ResultadoCenario; registro: ExecucaoCenario }> {
  const resultado = await executarCenario(ctx, cenario);
  const registro = registrarExecucao(ctx, cenario, resultado, origem, agendamentoId);
  return { resultado, registro };
}
