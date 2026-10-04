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
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPost, apiPut } from '../nucleo/cliente';
import { nomeDoMonitor } from '../nucleo/monitores';

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

/** Quais programas cada máquina usa: só eles aparecem no painel e em "Alterar". */
function ProgramasDasMaquinas() {
  const { snapshot } = useAppContexto();
  // Vale na hora; o painel confirma na leitura seguinte.
  const [locais, setLocais] = useState<Record<string, Aplicativo[]>>({});
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
        Marque o que se usa em cada computador. O que não estiver marcado some do painel: do quadro da máquina
        e de "Alterar", onde ficam Abrir, Reiniciar e Fechar.
      </p>
      <ul className="monitores-avisos">
        {maquinas.map((maquina) => (
          <li key={maquina.id} className="monitor-avisos">
            <p className="monitor-avisos__nome">{maquina.nome}</p>
            <div className="seletor-dias seletor-dias--livre">
              {APLICATIVOS.map((app) => {
                const marcado = usados(maquina).includes(app);
                return (
                  <button
                    key={app}
                    type="button"
                    aria-pressed={marcado}
                    className={`seletor-dias__dia${marcado ? ' seletor-dias__dia--marcado' : ''}`}
                    onClick={() => void alternar(maquina, app)}
                  >
                    {NOMES_APLICATIVOS[app]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ajustes da operação que a equipe muda pelo painel. */
export function Ajustes() {
  return (
    <div className="ajustes">
      <ProgramasDasMaquinas />
      <MonitoresDosAvisos />
      <IntervaloHeartbeat />
    </div>
  );
}
