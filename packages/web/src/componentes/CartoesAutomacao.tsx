import { useState } from 'react';
import { DIAS_SEMANA, type ExecucaoCenario, type OrigemExecucao } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import '../estilos/painel.css';

const ORIGENS: Record<OrigemExecucao, string> = {
  manual: 'manual',
  agendado: 'agendado',
  aoLigar: 'ao ligar',
};

function hora(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function inicioDoDia(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** "hoje 18:50", "amanhã 18:50" ou "dom 18:50". */
function quandoFuturo(ts: number): string {
  const dias = Math.round((inicioDoDia(ts) - inicioDoDia(Date.now())) / DIA_MS);
  if (dias <= 0) return `hoje ${hora(ts)}`;
  if (dias === 1) return `amanhã ${hora(ts)}`;
  return `${(DIAS_SEMANA[new Date(ts).getDay()] ?? '').toLowerCase()} ${hora(ts)}`;
}

/** "hoje 18:52", "ontem 18:52" ou "dom 18:52". */
function quandoPassado(ts: number): string {
  const dias = Math.round((inicioDoDia(Date.now()) - inicioDoDia(ts)) / DIA_MS);
  if (dias <= 0) return `hoje ${hora(ts)}`;
  if (dias === 1) return `ontem ${hora(ts)}`;
  return `${(DIAS_SEMANA[new Date(ts).getDay()] ?? '').toLowerCase()} ${hora(ts)}`;
}

/** Próximos horários marcados (até 2). Só informação. */
function CartaoAgendamentos() {
  const { automacoes } = useAppContexto();
  if (!automacoes?.temHorarios) return null;
  return (
    <section className="info cartao-info" aria-label="Agendamentos">
      <p className="cartao-info__titulo">Agendamentos</p>
      {!automacoes.ativo ? (
        <p className="cartao-info__linha cartao-info__linha--aviso">Automações desligadas</p>
      ) : automacoes.proximos.length === 0 ? (
        <p className="cartao-info__linha">Nenhum horário à frente</p>
      ) : (
        <ul className="cartao-info__lista">
          {automacoes.proximos.slice(0, 2).map((p) => (
            <li key={`${p.agendamentoId}-${p.quando}`} className="cartao-info__linha">
              {p.cenarioNome} · {quandoFuturo(p.quando)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Última execução de cenário: fica até a próxima acontecer. Falha vem aberta e em vermelho. */
function CartaoUltimaExecucao({ execucao }: { execucao: ExecucaoCenario }) {
  const [aberto, setAberto] = useState(false);
  const passos = execucao.passos ?? [];
  const origem = ORIGENS[execucao.origem ?? 'agendado'];
  const mostrarPassos = passos.length > 0 && (!execucao.ok || aberto);

  return (
    <section className={`info cartao-info${execucao.ok ? '' : ' cartao-info--falha'}`} aria-label="Última execução">
      <p className="cartao-info__titulo">Última execução</p>
      <p className="cartao-info__linha cartao-info__linha--forte">{execucao.cenarioNome}</p>
      <p className="cartao-info__linha">
        {quandoPassado(execucao.ts)} · {origem} ·{' '}
        <span className={execucao.ok ? 'cartao-info__ok' : 'cartao-info__erro'}>
          {execucao.ok ? 'tudo certo' : 'falhou'}
        </span>
      </p>
      {!execucao.ok && execucao.resumo ? <p className="cartao-info__linha">{execucao.resumo}</p> : null}
      {execucao.ok && passos.length > 0 ? (
        <button
          type="button"
          className="cartao-info__ver"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? 'ocultar passos' : 'ver passos'}
        </button>
      ) : null}
      {mostrarPassos ? (
        <ul className="cartao-info__passos">
          {passos.map((passo, i) => (
            <li key={i} className={passo.ok ? undefined : 'cartao-info__passo--falha'}>
              <span aria-hidden="true">{passo.ok ? '✓' : '✗'}</span> {passo.descricao}
              {!passo.ok && passo.erro ? <span className="cartao-info__motivo"> — {passo.erro}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Os dois cartões de informação no alto do Painel, abaixo dos botões de cenário. */
export function CartoesAutomacao() {
  const { automacoes } = useAppContexto();
  if (!automacoes) return null;
  return (
    <>
      <CartaoAgendamentos />
      {automacoes.ultimaExecucao ? (
        <CartaoUltimaExecucao key={automacoes.ultimaExecucao.ts} execucao={automacoes.ultimaExecucao} />
      ) : null}
    </>
  );
}
