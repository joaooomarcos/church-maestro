import { useEffect, useState } from 'react';
import {
  APLICATIVOS,
  NOMES_APLICATIVOS,
  ROTAS,
  type Aplicativo,
  type Ajustes as AjustesHub,
  type DispositivoConfig,
  type EstadoDispositivo,
} from '@maestro/shared';
import { Icone } from '../componentes/Icone';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPost, apiPut } from '../nucleo/cliente';
import { nomeDoMonitor } from '../nucleo/monitores';
import { AjustesLegendas } from './AjustesLegendas';
import { AjustesNdi } from './AjustesNdi';

const INTERVALOS_HEARTBEAT = [5, 10, 20, 30, 60];

const MENSAGEM_TESTE = 'Teste do Maestro: os avisos desta máquina vão aparecer aqui.';

function IntervaloHeartbeat() {
  const [segundos, setSegundos] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiGet<AjustesHub>(ROTAS.ajustes)
      .then((ajustes) => setSegundos(Math.round((ajustes.intervaloHeartbeatMs ?? 10_000) / 1000)))
      .catch(() => {
        // erro já virou toast
      });
  }, []);

  async function salvar(novoEmSegundos: number): Promise<void> {
    const anterior = segundos;
    setSegundos(novoEmSegundos);
    setSalvando(true);
    try {
      await apiPost(ROTAS.ajustes, { intervaloHeartbeatMs: novoEmSegundos * 1000 });
    } catch {
      setSegundos(anterior);
    } finally {
      setSalvando(false);
    }
  }

  if (segundos === null) return null;

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Aviso de "estou viva"</h2>
      <select
        className="versoes__select"
        value={segundos}
        disabled={salvando}
        onChange={(evento) => void salvar(Number(evento.target.value))}
      >
        {INTERVALOS_HEARTBEAT.map((valor) => (
          <option key={valor} value={valor}>
            a cada {valor} segundos
          </option>
        ))}
      </select>
      <p className="versoes__dica">
        De quanto em quanto tempo cada máquina avisa o hub que está no ar. Vale para todas; um
        intervalo menor deixa o painel mais rápido em perceber uma queda.
      </p>
    </section>
  );
}

function MonitorDaMaquina({ dispositivo, escolhido }: { dispositivo: EstadoDispositivo; escolhido: string | null }) {
  const { notificar } = useAppContexto();
  const [valor, setValor] = useState(escolhido ?? '');
  const [ocupado, setOcupado] = useState(false);
  const agente = dispositivo.agente;
  const monitores = agente?.monitores;

  useEffect(() => setValor(escolhido ?? ''), [escolhido]);

  async function escolher(novo: string): Promise<void> {
    const anterior = valor;
    setValor(novo);
    try {
      await apiPut(ROTAS.monitorAvisos.replace(':id', encodeURIComponent(dispositivo.id)), { monitor: novo || null });
    } catch {
      setValor(anterior);
    }
  }

  async function testar(): Promise<void> {
    setOcupado(true);
    try {
      const { falhas } = await apiPost<{ falhas: string[] }>(ROTAS.aviso, {
        dispositivos: [dispositivo.id],
        mensagem: MENSAGEM_TESTE,
        noPainel: false,
      });
      if (falhas.length > 0) notificar(falhas.join('; '), 'erro');
      else notificar(`Aviso enviado para ${dispositivo.nome}. Confira em que tela ele abriu.`, 'info');
    } catch {
      // erro já virou toast
    } finally {
      setOcupado(false);
    }
  }

  let escolha;
  if (agente?.so === 'linux') {
    escolha = <p className="versoes__dica">Notificação do sistema (o Linux escolhe onde mostrar).</p>;
  } else if (!monitores) {
    escolha = (
      <p className="versoes__dica">
        {agente?.online ? 'Atualize esta máquina para escolher o monitor. Até lá, vai no principal.' : 'Máquina fora do ar.'}
      </p>
    );
  } else {
    const conhecido = !valor || monitores.some((m) => m.id === valor);
    escolha = (
      <select className="versoes__select" value={valor} onChange={(e) => void escolher(e.target.value)}>
        <option value="">Monitor principal</option>
        {monitores.map((monitor) => (
          <option key={monitor.id} value={monitor.id}>
            {nomeDoMonitor(monitor)}
          </option>
        ))}
        {conhecido ? null : <option value={valor}>{valor} (desconectado)</option>}
      </select>
    );
  }

  return (
    <li className="monitor-avisos">
      <div className="monitor-avisos__linha">
        <p className="monitor-avisos__nome">{dispositivo.nome}</p>
        <button
          type="button"
          className="botao-secundario monitor-avisos__testar"
          disabled={ocupado || !agente?.online}
          onClick={() => void testar()}
        >
          {ocupado ? 'Enviando…' : 'Testar'}
        </button>
      </div>
      {escolha}
    </li>
  );
}

function MonitoresDosAvisos() {
  const { snapshot } = useAppContexto();
  const [escolhas, setEscolhas] = useState<Record<string, string | null> | null>(null);

  useEffect(() => {
    apiGet<{ dispositivos: DispositivoConfig[] }>(ROTAS.dispositivos)
      .then((resposta) =>
        setEscolhas(Object.fromEntries(resposta.dispositivos.map((d) => [d.id, d.monitorAvisos ?? null]))),
      )
      .catch(() => {
        // erro já virou toast
      });
  }, []);

  const maquinas = (snapshot?.dispositivos ?? []).filter((d) => d.agente !== undefined);
  if (!escolhas || maquinas.length === 0) return null;

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Avisos dos cenários</h2>
      <p className="versoes__dica">
        Ao mandar um aviso pela tela Avisos, você escolhe o monitor na hora. Este é só o padrão dos avisos que
        saem sozinhos, em cenários e agendamentos. Escolha a tela de quem opera — nunca a do telão nem a
        que o NDI Screen Capture envia, senão o aviso aparece para a igreja ou na live. Use "Testar" para ver
        qual é qual.
      </p>
      <ul className="monitores-avisos">
        {maquinas.map((dispositivo) => (
          <MonitorDaMaquina key={dispositivo.id} dispositivo={dispositivo} escolhido={escolhas[dispositivo.id] ?? null} />
        ))}
      </ul>
    </section>
  );
}

/** Quais programas cada máquina usa: só eles aparecem no painel e nas telas de cada programa. */
function ProgramasDasMaquinas() {
  const { snapshot } = useAppContexto();
  // Vale na hora; o painel confirma na leitura seguinte.
  const [locais, setLocais] = useState<Record<string, Aplicativo[]>>({});
  // Todos abertos por padrão: guardamos só os que a pessoa recolheu.
  const [recolhidos, setRecolhidos] = useState<Record<string, boolean>>({});
  const maquinas = (snapshot?.dispositivos ?? []).filter((d) => d.agente !== undefined);
  if (maquinas.length === 0) return null;

  function usados(maquina: EstadoDispositivo): Aplicativo[] {
    return locais[maquina.id] ?? maquina.apps ?? maquina.agente?.appsInstalados ?? [...APLICATIVOS];
  }

  async function alternar(maquina: EstadoDispositivo, app: Aplicativo): Promise<void> {
    const atuais = usados(maquina);
    const novos = atuais.includes(app) ? atuais.filter((a) => a !== app) : [...atuais, app];
    setLocais((todos) => ({ ...todos, [maquina.id]: novos }));
    try {
      await apiPut(ROTAS.appsDaMaquina.replace(':id', encodeURIComponent(maquina.id)), { apps: novos });
    } catch {
      setLocais((todos) => ({ ...todos, [maquina.id]: atuais }));
    }
  }

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Programas de cada máquina</h2>
      <p className="versoes__dica">
        Marque o que cada computador usa. O que não estiver ligado some do painel.
      </p>
      <ul className="programas-maquinas">
        {maquinas.map((maquina) => {
          const ligados = usados(maquina);
          const aberto = !recolhidos[maquina.id];
          return (
            <li key={maquina.id} className="programas-maquina">
              <button
                type="button"
                className="programas-maquina__cabecalho"
                aria-expanded={aberto}
                onClick={() => setRecolhidos((todos) => ({ ...todos, [maquina.id]: aberto }))}
              >
                <span className="programas-maquina__nome">{maquina.nome}</span>
                <span className="programas-maquina__resumo">
                  {ligados.length} de {APLICATIVOS.length}
                </span>
                <span className={`programas-maquina__seta${aberto ? ' programas-maquina__seta--aberta' : ''}`}>
                  <Icone nome="chevron-baixo" tamanho={20} />
                </span>
              </button>
              {aberto ? (
                <ul className="programas-maquina__lista">
                  {APLICATIVOS.map((app) => {
                    const ligado = ligados.includes(app);
                    return (
                      <li key={app} className="programas-maquina__linha">
                        <span>{NOMES_APLICATIVOS[app]}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ligado}
                          aria-label={`${NOMES_APLICATIVOS[app]} em ${maquina.nome}`}
                          className={`interruptor${ligado ? ' interruptor--ligado' : ''}`}
                          onClick={() => void alternar(maquina, app)}
                        >
                          <span className="interruptor__bolinha" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ajustes da operação que a equipe muda pelo painel. */
export function Ajustes() {
  return (
    <div className="ajustes">
      <ProgramasDasMaquinas />
      <AjustesLegendas />
      <AjustesNdi />
      <MonitoresDosAvisos />
      <IntervaloHeartbeat />
    </div>
  );
}
