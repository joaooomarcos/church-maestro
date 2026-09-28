import { useCallback, useEffect, useState } from 'react';
import {
  DIAS_SEMANA,
  ROTAS,
  type Agendamento,
  type Cenario,
  type RespostaAutomacoes,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPut } from '../nucleo/cliente';
import { Icone } from '../componentes/Icone';
import { IconeCenario } from '../componentes/IconeCenario';

/** crypto.randomUUID só existe em HTTPS, e o painel roda em http://<ip>. */
function novoId(): string {
  return `ag-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function descreverDias(dias: number[]): string {
  if (dias.length === 7) return 'Todos os dias';
  return [...dias]
    .sort((a, b) => a - b)
    .map((dia) => DIAS_SEMANA[dia])
    .join(', ');
}

function descreverQuando(ts: number): string {
  const data = new Date(ts);
  const dia = DIAS_SEMANA[data.getDay()] ?? '';
  const dataCurta = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const hora = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia} ${dataCurta}, ${hora}`;
}

function Interruptor({
  ligado,
  rotulo,
  aoMudar,
  desabilitado,
}: {
  ligado: boolean;
  rotulo: string;
  aoMudar: (ligado: boolean) => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      disabled={desabilitado}
      className={`interruptor${ligado ? ' interruptor--ligado' : ''}`}
      onClick={() => aoMudar(!ligado)}
    >
      <span className="interruptor__bolinha" />
    </button>
  );
}

export function Agendamentos() {
  const { notificar } = useAppContexto();
  const [dados, setDados] = useState<RespostaAutomacoes | null>(null);
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [rascunho, setRascunho] = useState<Agendamento | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [automacoes, lista] = await Promise.all([
        apiGet<RespostaAutomacoes>(ROTAS.automacoes),
        apiGet<{ cenarios: Cenario[] }>(ROTAS.cenarios),
      ]);
      setDados(automacoes);
      setCenarios(lista.cenarios);
    } catch {
      // erro já virou toast
    }
  }, []);

  useEffect(() => {
    void carregar();
    // A próxima execução e o histórico mudam sozinhos com o tempo.
    const timer = window.setInterval(() => void carregar(), 30_000);
    return () => window.clearInterval(timer);
  }, [carregar]);

  /** A tela manda a lista inteira: é pequena e evita meia edição. */
  async function gravar(ativo: boolean, agendamentos: Agendamento[]): Promise<boolean> {
    setSalvando(true);
    try {
      setDados(await apiPut<RespostaAutomacoes>(ROTAS.automacoes, { ativo, agendamentos }));
      return true;
    } catch {
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvarRascunho(): Promise<void> {
    if (!rascunho || !dados) return;
    if (!rascunho.cenarioId) return notificar('Escolha o cenário.', 'alerta');
    if (rascunho.dias.length === 0) return notificar('Escolha pelo menos um dia.', 'alerta');
    const existe = dados.agendamentos.some((a) => a.id === rascunho.id);
    const lista = existe
      ? dados.agendamentos.map((a) => (a.id === rascunho.id ? rascunho : a))
      : [...dados.agendamentos, rascunho];
    if (await gravar(dados.ativo, lista)) {
      setRascunho(null);
      notificar('Agendamento salvo.', 'info');
    }
  }

  if (!dados) return <p className="painel__vazio">Carregando agendamentos…</p>;

  const nomeDoCenario = (id: string) => cenarios.find((c) => c.id === id);

  return (
    <div className="agendamentos">
      <section className={`versoes__alvo automacoes-geral${dados.ativo ? '' : ' automacoes-geral--desligado'}`}>
        <div className="automacoes-geral__linha">
          <div>
            <p className="automacoes-geral__titulo">Automações {dados.ativo ? 'ligadas' : 'desligadas'}</p>
            <p className="versoes__dica">
              {dados.ativo
                ? 'Os agendamentos abaixo rodam sozinhos na hora marcada.'
                : 'Nenhum agendamento roda enquanto isto estiver desligado.'}
            </p>
          </div>
          <Interruptor
            ligado={dados.ativo}
            rotulo="Ligar ou desligar todas as automações"
            desabilitado={salvando}
            aoMudar={(ligado) => void gravar(ligado, dados.agendamentos)}
          />
        </div>
      </section>

      {rascunho ? (
        <section className="versoes__alvo cenario-editor">
          <h2 className="versoes__titulo">
            {dados.agendamentos.some((a) => a.id === rascunho.id) ? 'Editar agendamento' : 'Novo agendamento'}
          </h2>
          <label className="campo">
            <span className="campo__rotulo">Cenário</span>
            <select
              className="versoes__select"
              value={rascunho.cenarioId}
              onChange={(e) => setRascunho({ ...rascunho, cenarioId: e.target.value })}
            >
              <option value="">Escolha…</option>
              {cenarios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="campo">
            <span className="campo__rotulo">Dias</span>
            <div className="seletor-dias">
              {DIAS_SEMANA.map((rotulo, dia) => {
                const marcado = rascunho.dias.includes(dia);
                return (
                  <button
                    key={rotulo}
                    type="button"
                    aria-pressed={marcado}
                    className={`seletor-dias__dia${marcado ? ' seletor-dias__dia--marcado' : ''}`}
                    onClick={() =>
                      setRascunho({
                        ...rascunho,
                        dias: marcado ? rascunho.dias.filter((d) => d !== dia) : [...rascunho.dias, dia],
                      })
                    }
                  >
                    {rotulo}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="campo">
            <span className="campo__rotulo">Hora</span>
            <input
              className="campo__entrada"
              type="time"
              value={rascunho.hora}
              onChange={(e) => setRascunho({ ...rascunho, hora: e.target.value })}
            />
          </label>
          <div className="cenario-editor__rodape">
            <button type="button" className="botao-acao" disabled={salvando} onClick={() => void salvarRascunho()}>
              {salvando ? 'Salvando…' : 'Salvar agendamento'}
            </button>
            <button type="button" className="botao-secundario" onClick={() => setRascunho(null)}>
              Cancelar
            </button>
          </div>
        </section>
      ) : (
        <>
          {dados.agendamentos.length === 0 ? (
            <p className="painel__vazio">Nenhum agendamento ainda.</p>
          ) : (
            <ul className="lista-cenarios">
              {dados.agendamentos.map((agendamento) => {
                const cenario = nomeDoCenario(agendamento.cenarioId);
                const proxima = dados.proximas[agendamento.id];
                return (
                  <li
                    key={agendamento.id}
                    className={`cartao-cenario${agendamento.ativo && dados.ativo ? '' : ' cartao-cenario--apagado'}`}
                  >
                    <span className="cartao-cenario__icone">
                      <IconeCenario icone={cenario?.icone} />
                    </span>
                    <div className="cartao-cenario__texto">
                      <p className="cartao-cenario__nome">
                        {cenario?.nome ?? 'Cenário removido'} · {agendamento.hora}
                      </p>
                      <p className="cartao-cenario__descricao">
                        {descreverDias(agendamento.dias)}
                        {proxima ? ` — próximo: ${descreverQuando(proxima)}` : ''}
                      </p>
                    </div>
                    <div className="cartao-cenario__acoes">
                      <button
                        type="button"
                        className="botao-icone"
                        aria-label="Editar agendamento"
                        onClick={() => setRascunho({ ...agendamento })}
                      >
                        <Icone nome="editar" tamanho={18} />
                      </button>
                      <button
                        type="button"
                        className="botao-icone botao-icone--perigo"
                        aria-label="Remover agendamento"
                        onClick={() => {
                          if (!window.confirm('Remover este agendamento?')) return;
                          void gravar(
                            dados.ativo,
                            dados.agendamentos.filter((a) => a.id !== agendamento.id),
                          );
                        }}
                      >
                        <Icone nome="lixo" tamanho={18} />
                      </button>
                      <Interruptor
                        ligado={agendamento.ativo}
                        rotulo="Ligar ou desligar este agendamento"
                        desabilitado={salvando}
                        aoMudar={(ligado) =>
                          void gravar(
                            dados.ativo,
                            dados.agendamentos.map((a) => (a.id === agendamento.id ? { ...a, ativo: ligado } : a)),
                          )
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            className="botao-acao"
            disabled={cenarios.length === 0}
            onClick={() =>
              setRascunho({ id: novoId(), cenarioId: cenarios[0]?.id ?? '', dias: [0], hora: '18:50', ativo: true })
            }
          >
            <Icone nome="mais" tamanho={20} /> Novo agendamento
          </button>
          {cenarios.length === 0 ? (
            <p className="versoes__dica">Crie um cenário primeiro, no menu Cenários.</p>
          ) : null}
        </>
      )}

      <p className="versoes__dica">
        Roda no relógio do PC Transmissão, que precisa estar ligado e com o painel no ar na hora marcada. Se
        ele ligar mais de 2 minutos depois, aquele agendamento é pulado até a próxima vez.
      </p>

      {dados.historico.length > 0 ? (
        <section className="versoes__alvo">
          <h2 className="versoes__titulo">Últimas execuções</h2>
          <ul className="historico">
            {dados.historico.map((execucao) => (
              <li key={`${execucao.agendamentoId}-${execucao.ts}`} className="historico__item">
                <span className={`historico__marca${execucao.ok ? ' historico__marca--ok' : ' historico__marca--falha'}`}>
                  <Icone nome={execucao.ok ? 'ok' : 'falha'} tamanho={18} />
                </span>
                <div>
                  <p className="cartao-cenario__nome">
                    {execucao.cenarioNome} · {descreverQuando(execucao.ts)}
                  </p>
                  <p className="cartao-cenario__descricao">{execucao.resumo}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
