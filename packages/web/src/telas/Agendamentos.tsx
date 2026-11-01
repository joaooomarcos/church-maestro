import { useCallback, useEffect, useState } from 'react';
import {
  DIAS_SEMANA,
  ESPERA_GATILHO_OBS_PADRAO_S,
  ROTAS,
  ehGatilhoObs,
  ehVerificacao,
  type Automacao,
  type Cenario,
  type EstadoDispositivo,
  type CondicaoVerificacao,
  type GatilhoObs,
  type RespostaAutomacoes,
  type Verificacao,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPut } from '../nucleo/cliente';
import { Icone } from '../componentes/Icone';
import { IconeCenario } from '../componentes/IconeCenario';

/** crypto.randomUUID só existe em HTTPS, e o painel roda em http://<ip>. */
function novoId(): string {
  return `ag-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

const ORIGENS: Record<string, string> = {
  manual: 'toque manual',
  agendado: 'horário marcado',
  aoLigar: 'máquina ligou',
  obs: 'cena do OBS',
  verificacao: 'verificação',
};

function novoHorario(cenarioId: string, base?: Automacao): Automacao {
  return {
    id: base?.id ?? novoId(),
    tipo: 'horario',
    cenarioId,
    dias: base?.dias ?? [0],
    hora: '18:50',
    ativo: base?.ativo ?? true,
  };
}

function novoGatilho(cenarioId: string, maquinas: EstadoDispositivo[], base?: Automacao): GatilhoObs {
  const maquina = maquinas[0];
  return {
    id: base?.id ?? novoId(),
    tipo: 'obs',
    cenarioId,
    dispositivo: maquina?.id ?? '',
    cena: maquina?.obs?.cenaAtual ?? maquina?.obs?.cenas[0] ?? '',
    dias: base?.dias ?? [0],
    aPartirDe: '18:50',
    esperaSegundos: ESPERA_GATILHO_OBS_PADRAO_S,
    ativo: base?.ativo ?? true,
  };
}

function novaVerificacao(
  cenarioId: string,
  condicao: CondicaoVerificacao,
  maquinas: EstadoDispositivo[],
  base?: Automacao,
): Verificacao {
  return {
    id: base?.id ?? novoId(),
    tipo: 'verificacao',
    cenarioId,
    condicao,
    ...(condicao === 'obsSemTransmitir' ? { dispositivo: maquinas[0]?.id ?? '' } : {}),
    dias: base?.dias ?? [0],
    hora: '18:55',
    ativo: base?.ativo ?? true,
  };
}

const NOMES_CONDICAO: Record<CondicaoVerificacao, string> = {
  obsSemTransmitir: 'OBS sem transmitir',
  youtubeSemLive: 'YouTube sem ao vivo',
};

/** Opção escolhida em "Quando rodar". */
function modoDe(automacao: Automacao): string {
  if (ehGatilhoObs(automacao)) return 'obs';
  return ehVerificacao(automacao) ? automacao.condicao : 'horario';
}

/** Título do cartão: o que dispara a automação. */
function descreverGatilho(automacao: Automacao): string {
  if (ehGatilhoObs(automacao)) return `cena "${automacao.cena}" no ar`;
  if (ehVerificacao(automacao)) return `${NOMES_CONDICAO[automacao.condicao]} às ${automacao.hora}`;
  return automacao.hora;
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
  const { notificar, snapshot } = useAppContexto();
  const [dados, setDados] = useState<RespostaAutomacoes | null>(null);
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [rascunho, setRascunho] = useState<Automacao | null>(null);
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
  async function gravar(ativo: boolean, agendamentos: Automacao[]): Promise<boolean> {
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
    if (ehGatilhoObs(rascunho) && (!rascunho.dispositivo || !rascunho.cena)) {
      return notificar('Escolha a máquina e a cena do OBS.', 'alerta');
    }
    if (ehVerificacao(rascunho) && rascunho.condicao === 'obsSemTransmitir' && !rascunho.dispositivo) {
      return notificar('Escolha a máquina do OBS.', 'alerta');
    }
    const existe = dados.agendamentos.some((a) => a.id === rascunho.id);
    const lista = existe
      ? dados.agendamentos.map((a) => (a.id === rascunho.id ? rascunho : a))
      : [...dados.agendamentos, rascunho];
    if (await gravar(dados.ativo, lista)) {
      setRascunho(null);
      notificar('Automação salva.', 'info');
    }
  }

  if (!dados) return <p className="painel__vazio">Carregando automações…</p>;

  const nomeDoCenario = (id: string) => cenarios.find((c) => c.id === id);
  const maquinasObs = (snapshot?.dispositivos ?? []).filter((d) => d.obs !== undefined);
  const cenasDoObs = (gatilho: GatilhoObs): string[] =>
    maquinasObs.find((d) => d.id === gatilho.dispositivo)?.obs?.cenas ?? [];
  // A cena salva continua na lista mesmo se não estiver entre as que o OBS informou.
  const opcoesDeCena = (gatilho: GatilhoObs): string[] => {
    const cenas = cenasDoObs(gatilho);
    return gatilho.cena && !cenas.includes(gatilho.cena) ? [gatilho.cena, ...cenas] : cenas;
  };

  return (
    <div className="agendamentos">
      <section className={`versoes__alvo automacoes-geral${dados.ativo ? '' : ' automacoes-geral--desligado'}`}>
        <div className="automacoes-geral__linha">
          <div>
            <p className="automacoes-geral__titulo">Automações {dados.ativo ? 'ligadas' : 'desligadas'}</p>
            <p className="versoes__dica">
              {dados.ativo
                ? 'As automações abaixo rodam sozinhas na hora marcada.'
                : 'Nenhuma automação roda enquanto isto estiver desligado.'}
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
            {dados.agendamentos.some((a) => a.id === rascunho.id) ? 'Editar automação' : 'Nova automação'}
          </h2>
          <label className="campo">
            <span className="campo__rotulo">Quando rodar</span>
            <select
              className="versoes__select"
              value={modoDe(rascunho)}
              onChange={(e) => {
                const modo = e.target.value;
                setRascunho(
                  modo === 'obs'
                    ? novoGatilho(rascunho.cenarioId, maquinasObs, rascunho)
                    : modo === 'obsSemTransmitir' || modo === 'youtubeSemLive'
                      ? novaVerificacao(rascunho.cenarioId, modo, maquinasObs, rascunho)
                      : novoHorario(rascunho.cenarioId, rascunho),
                );
              }}
            >
              <option value="horario">Em um horário</option>
              <option value="obs">Quando uma cena do OBS estiver no ar</option>
              <option value="obsSemTransmitir">Verificar: OBS sem transmitir</option>
              <option value="youtubeSemLive">Verificar: YouTube sem ao vivo</option>
            </select>
          </label>
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
          <>
              {ehGatilhoObs(rascunho) ? (
                <>
                  {maquinasObs.length > 1 ? (
                    <label className="campo">
                      <span className="campo__rotulo">Máquina</span>
                      <select
                        className="versoes__select"
                        value={rascunho.dispositivo}
                        onChange={(e) => setRascunho({ ...rascunho, dispositivo: e.target.value })}
                      >
                        {maquinasObs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {maquinasObs.length === 0 ? (
                    <p className="versoes__dica">
                      Nenhuma máquina tem o OBS configurado. Rode o assistente de instalação no PC do OBS.
                    </p>
                  ) : null}
                  <label className="campo">
                    <span className="campo__rotulo">Cena</span>
                    {cenasDoObs(rascunho).length > 0 ? (
                      <select
                        className="versoes__select"
                        value={rascunho.cena}
                        onChange={(e) => setRascunho({ ...rascunho, cena: e.target.value })}
                      >
                        {opcoesDeCena(rascunho).map((cena) => (
                          <option key={cena} value={cena}>
                            {cena}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="campo__entrada"
                        value={rascunho.cena}
                        placeholder="Nome exato da cena no OBS"
                        onChange={(e) => setRascunho({ ...rascunho, cena: e.target.value })}
                      />
                    )}
                  </label>
                </>
              ) : null}
              {ehVerificacao(rascunho) && rascunho.condicao === 'obsSemTransmitir' ? (
                <>
                  {maquinasObs.length > 1 ? (
                    <label className="campo">
                      <span className="campo__rotulo">Máquina</span>
                      <select
                        className="versoes__select"
                        value={rascunho.dispositivo ?? ''}
                        onChange={(e) => setRascunho({ ...rascunho, dispositivo: e.target.value })}
                      >
                        {maquinasObs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {maquinasObs.length === 0 ? (
                    <p className="versoes__dica">
                      Nenhuma máquina tem o OBS configurado. Rode o assistente de instalação no PC do OBS.
                    </p>
                  ) : null}
                </>
              ) : null}
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
              {ehGatilhoObs(rascunho) ? (
                <>
                  <label className="campo">
                    <span className="campo__rotulo">A partir de</span>
                    <input
                      className="campo__entrada"
                      type="time"
                      value={rascunho.aPartirDe}
                      onChange={(e) => setRascunho({ ...rascunho, aPartirDe: e.target.value })}
                    />
                  </label>
                  <label className="campo">
                    <span className="campo__rotulo">Esperar antes de rodar (segundos)</span>
                    <input
                      className="campo__entrada"
                      type="number"
                      min={0}
                      max={600}
                      value={rascunho.esperaSegundos}
                      onChange={(e) => {
                        const valor = Math.round(Number(e.target.value));
                        setRascunho({
                          ...rascunho,
                          esperaSegundos: Number.isFinite(valor) ? Math.min(600, Math.max(0, valor)) : ESPERA_GATILHO_OBS_PADRAO_S,
                        });
                      }}
                    />
                  </label>
                  <p className="versoes__dica">
                    Conta com a cena no ar e o OBS transmitindo. Depois que a contagem começa, trocar de cena não
                    cancela; parar a transmissão cancela. Roda uma vez por dia.
                  </p>
                </>
              ) : (
                <>
                <label className="campo">
                  <span className="campo__rotulo">{ehVerificacao(rascunho) ? 'Verificar às' : 'Hora'}</span>
                  <input
                    className="campo__entrada"
                    type="time"
                    value={rascunho.hora}
                    onChange={(e) => setRascunho({ ...rascunho, hora: e.target.value })}
                  />
                </label>
                {ehVerificacao(rascunho) ? (
                  <p className="versoes__dica">
                    {rascunho.condicao === 'obsSemTransmitir'
                      ? 'Nesta hora, se o OBS não estiver transmitindo (ou estiver fechado), o cenário roda. Confere uma vez por dia.'
                      : 'Nesta hora, se o canal não estiver ao vivo no YouTube, o cenário roda. Precisa do canal e da chave em Ajustes › YouTube. A live pode demorar alguns minutos para aparecer.'}
                  </p>
                ) : null}
                </>
              )}
            </>
          <div className="cenario-editor__rodape">
            <button type="button" className="botao-acao" disabled={salvando} onClick={() => void salvarRascunho()}>
              {salvando ? 'Salvando…' : 'Salvar automação'}
            </button>
            <button type="button" className="botao-secundario" onClick={() => setRascunho(null)}>
              Cancelar
            </button>
          </div>
        </section>
      ) : (
        <>
          {dados.agendamentos.length === 0 ? (
            <p className="painel__vazio">Nenhuma automação ainda.</p>
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
                        {`${cenario?.nome ?? 'Cenário removido'} · ${descreverGatilho(agendamento)}`}
                      </p>
                      <p className="cartao-cenario__descricao">
                        {ehGatilhoObs(agendamento)
                          ? `${descreverDias(agendamento.dias)} — a partir de ${agendamento.aPartirDe}, depois de ${agendamento.esperaSegundos} s`
                          : `${descreverDias(agendamento.dias)}${proxima ? ` — próximo: ${descreverQuando(proxima)}` : ''}`}
                      </p>
                    </div>
                    <div className="cartao-cenario__acoes">
                      <button
                        type="button"
                        className="botao-icone"
                        aria-label="Editar automação"
                        onClick={() => setRascunho({ ...agendamento })}
                      >
                        <Icone nome="editar" tamanho={18} />
                      </button>
                      <button
                        type="button"
                        className="botao-icone botao-icone--perigo"
                        aria-label="Remover automação"
                        onClick={() => {
                          if (!window.confirm('Remover esta automação?')) return;
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
                        rotulo="Ligar ou desligar esta automação"
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
            onClick={() => setRascunho(novoHorario(cenarios[0]?.id ?? ''))}
          >
            <Icone nome="mais" tamanho={20} /> Nova automação
          </button>
          {cenarios.length === 0 ? (
            <p className="versoes__dica">Crie um cenário primeiro, no menu Cenários.</p>
          ) : null}
        </>
      )}

      <p className="versoes__dica">
        Os horários rodam no relógio do PC Transmissão, que precisa estar ligado e com o painel no ar na hora
        marcada; se ele ligar mais de 2 minutos depois, aquele horário é pulado até a próxima vez. O gatilho do OBS
        não tem esse limite: conta quando a cena estiver no ar e transmitindo, a partir da hora escolhida. A verificação
        olha a condição (OBS sem transmitir, YouTube sem ao vivo) na hora marcada, com a mesma tolerância dos
        horários, e só então roda o cenário. O que cada
        máquina faz quando liga fica em Máquinas › Ao ligar, e roda mesmo com o painel desligado.
      </p>

      {dados.historico.length > 0 ? (
        <section className="versoes__alvo">
          <h2 className="versoes__titulo">Últimas execuções</h2>
          <ul className="historico">
            {dados.historico.map((execucao) => (
              <li key={`${execucao.agendamentoId ?? execucao.origem ?? 'x'}-${execucao.ts}`} className="historico__item">
                <span className={`historico__marca${execucao.ok ? ' historico__marca--ok' : ' historico__marca--falha'}`}>
                  <Icone nome={execucao.ok ? 'ok' : 'falha'} tamanho={18} />
                </span>
                <div>
                  <p className="cartao-cenario__nome">
                    {execucao.cenarioNome} · {descreverQuando(execucao.ts)}
                    {execucao.origem ? ` · ${ORIGENS[execucao.origem] ?? execucao.origem}` : ''}
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
