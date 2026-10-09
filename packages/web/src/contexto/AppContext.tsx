import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  ExecucaoCenario,
  MensagemHub,
  ProximoAgendamento,
  RespostaAutomacoes,
  ResultadoCheck,
  Snapshot,
} from '@maestro/shared';
import { ROTAS, ehAoLigar } from '@maestro/shared';
import { apiGet, apiPost, definirOuvinteNaoAutenticado, ouvirErros } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { ehTela, type TelaId } from '../componentes/MenuLateral';

const CHAVE_TELA = 'maestro:tela';

/** Volta para a tela em que a pessoa estava quando o painel recarrega. */
function telaSalva(): TelaId {
  try {
    const salva = window.localStorage.getItem(CHAVE_TELA);
    return ehTela(salva) ? salva : 'painel';
  } catch {
    return 'painel';
  }
}

/** O que o Painel mostra de Automações: próximos horários e a última execução. */
export interface DadosAutomacoes {
  /** Interruptor global das automações. */
  ativo: boolean;
  /** Há agendamento por horário cadastrado (mesmo com o interruptor desligado). */
  temHorarios: boolean;
  proximos: ProximoAgendamento[];
  ultimaExecucao: ExecucaoCenario | null;
}

/** Pedido de abrir uma tela já numa máquina (toque num tile do Painel). */
interface PedidoMaquina {
  tela: TelaId;
  pcId: string;
}

type NivelToast = 'info' | 'alerta' | 'erro';

interface Toast {
  id: string;
  mensagem: string;
  nivel: NivelToast;
}

/** Aviso para a equipe vindo de um cenário: fica na tela até alguém fechar. */
export interface AlertaEquipe {
  id: string;
  texto: string;
  ts: number;
}

interface RespostaSessao {
  autenticado: boolean;
}

interface AppContextoValor {
  /** null enquanto a checagem inicial de sessão não terminou. */
  autenticado: boolean | null;
  entrar: (pin: string) => Promise<{ ok: boolean; mensagem?: string }>;
  snapshot: Snapshot | null;
  /** true enquanto o WebSocket não está conectado — dispara a faixa no topo. */
  reconectando: boolean;
  /** Resultados de checks em andamento/concluídos, por id, vindos do WS. */
  resultadosCheck: Record<string, ResultadoCheck>;
  toasts: Toast[];
  alertas: AlertaEquipe[];
  fecharAlerta: (id: string) => void;
  removerToast: (id: string) => void;
  notificar: (mensagem: string, nivel?: NivelToast) => void;
  tela: TelaId;
  /** Troca de tela; com `pcId`, a tela abre já naquela máquina. */
  abrirTela: (tela: TelaId, opcoes?: { pcId?: string }) => void;
  /** Máquina pedida para a tela informada (só vale para quem a abriu pedindo uma). */
  maquinaPedida: (tela: TelaId) => string | null;
  /** null até o primeiro carregamento. */
  automacoes: DadosAutomacoes | null;
  recarregarAutomacoes: () => void;
}

/**
 * Slots do layout (cabeçalho e rodapé fixos). Ficam num contexto à parte, com o
 * estado num componente filho: publicar um slot re-renderiza só o App, não a
 * tela que publicou (que, relendo o contexto principal, republicaria sem fim).
 */
interface SlotsLayoutValor {
  controlesRodape: ReactNode | null;
  controlesCabecalho: ReactNode | null;
}

interface DefinidoresSlots {
  definirControlesRodape: (node: ReactNode | null) => void;
  definirControlesCabecalho: (node: ReactNode | null) => void;
}

const SlotsLayoutContexto = createContext<SlotsLayoutValor>({
  controlesRodape: null,
  controlesCabecalho: null,
});
const DefinidoresSlotsContexto = createContext<DefinidoresSlots | null>(null);

/** O que as telas publicaram nos slots; quem desenha o cabeçalho/rodapé (App) lê daqui. */
export function useSlotsLayout(): SlotsLayoutValor {
  return useContext(SlotsLayoutContexto);
}

function ProvedorSlots({ children }: { children: ReactNode }) {
  const [controlesRodape, definirControlesRodape] = useState<ReactNode | null>(null);
  const [controlesCabecalho, definirControlesCabecalho] = useState<ReactNode | null>(null);
  const definidores = useRef<DefinidoresSlots>({ definirControlesRodape, definirControlesCabecalho });
  return (
    <DefinidoresSlotsContexto.Provider value={definidores.current}>
      <SlotsLayoutContexto.Provider value={{ controlesRodape, controlesCabecalho }}>
        {children}
      </SlotsLayoutContexto.Provider>
    </DefinidoresSlotsContexto.Provider>
  );
}

const AppContexto = createContext<AppContextoValor | null>(null);

export function useAppContexto(): AppContextoValor {
  const valor = useContext(AppContexto);
  if (!valor) throw new Error('useAppContexto usado fora de <AppProvider>.');
  return valor;
}

/**
 * Publica um bloco de controles no rodapé fixo (os botões gigantes de
 * anterior/próximo, por exemplo) enquanto a tela que chamou estiver montada.
 */
export function useControlesRodape(node: ReactNode | null): void {
  const definidores = useContext(DefinidoresSlotsContexto);
  useEffect(() => {
    definidores?.definirControlesRodape(node);
    return () => definidores?.definirControlesRodape(null);
  });
}

/**
 * Publica controles no cabeçalho, à direita do título (o seletor de PC, por
 * exemplo), enquanto a tela que chamou estiver montada.
 */
export function useControlesCabecalho(node: ReactNode | null): void {
  const definidores = useContext(DefinidoresSlotsContexto);
  useEffect(() => {
    definidores?.definirControlesCabecalho(node);
    return () => definidores?.definirControlesCabecalho(null);
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reconectando, setReconectando] = useState(false);
  const [resultadosCheck, setResultadosCheck] = useState<Record<string, ResultadoCheck>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [alertas, setAlertas] = useState<AlertaEquipe[]>([]);
  const [tela, setTela] = useState<TelaId>(telaSalva);
  const [pedido, setPedido] = useState<PedidoMaquina | null>(null);
  const [automacoes, setAutomacoes] = useState<DadosAutomacoes | null>(null);

  const revisaoRef = useRef(-1);
  const wsRef = useRef<WebSocket | null>(null);
  const tentativaRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canceladoRef = useRef(false);

  const removerToast = useCallback((id: string) => {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const notificar = useCallback(
    (mensagem: string, nivel: NivelToast = 'erro') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((atuais) => [...atuais, { id, mensagem, nivel }]);
      setTimeout(() => removerToast(id), 6000);
    },
    [removerToast],
  );

  const fecharAlerta = useCallback((id: string) => {
    setAlertas((atuais) => atuais.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_TELA, tela);
    } catch {
      // sem armazenamento: só não lembra a tela
    }
  }, [tela]);

  const abrirTela = useCallback((destino: TelaId, opcoes?: { pcId?: string }) => {
    setPedido(opcoes?.pcId ? { tela: destino, pcId: opcoes.pcId } : null);
    setTela(destino);
  }, []);

  const maquinaPedida = useCallback(
    (destino: TelaId): string | null => (pedido && pedido.tela === destino ? pedido.pcId : null),
    [pedido],
  );

  const recarregarAutomacoes = useCallback(() => {
    apiGet<RespostaAutomacoes>(ROTAS.automacoes)
      .then((resposta) => {
        if (canceladoRef.current) return;
        setAutomacoes({
          ativo: resposta.ativo,
          temHorarios: resposta.agendamentos.some((a) => !ehAoLigar(a) && a.ativo),
          proximos: resposta.proximosAgendamentos,
          ultimaExecucao: resposta.ultimaExecucao,
        });
      })
      .catch(() => {
        // erro já virou toast pelo cliente de API.
      });
  }, []);

  // Checagem inicial de sessão + assina o "expirou" para qualquer chamada futura.
  useEffect(() => {
    let cancelado = false;
    definirOuvinteNaoAutenticado(() => {
      if (!cancelado) setAutenticado(false);
    });
    apiGet<RespostaSessao>(ROTAS.sessao)
      .then((resposta) => {
        if (!cancelado) setAutenticado(resposta.autenticado);
      })
      .catch(() => {
        if (!cancelado) setAutenticado(false);
      });
    return () => {
      cancelado = true;
      definirOuvinteNaoAutenticado(null);
    };
  }, []);

  // Toda falha de API (fora 401) vira toast automaticamente.
  useEffect(() => ouvirErros((mensagem) => notificar(mensagem, 'erro')), [notificar]);

  // Snapshot inicial + WebSocket, só depois de autenticado.
  useEffect(() => {
    if (!autenticado) return;
    canceladoRef.current = false;
    tentativaRef.current = 0;

    recarregarAutomacoes();

    apiGet<Snapshot>(ROTAS.snapshot)
      .then((dados) => {
        if (canceladoRef.current) return;
        if (dados.revisao >= revisaoRef.current) {
          revisaoRef.current = dados.revisao;
          setSnapshot(dados);
        }
      })
      .catch(() => {
        // erro já virou toast pelo cliente de API.
      });

    function agendarReconexao(): void {
      const espera = Math.min(15_000, 1000 * 2 ** tentativaRef.current);
      tentativaRef.current += 1;
      timeoutRef.current = setTimeout(conectar, espera);
    }

    function conectar(): void {
      if (canceladoRef.current) return;
      setReconectando(true);
      const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocolo}//${location.host}${ROTAS.ws}`);
      wsRef.current = ws;

      ws.onopen = () => {
        tentativaRef.current = 0;
        setReconectando(false);
      };

      ws.onmessage = (evento) => {
        let mensagem: MensagemHub;
        try {
          mensagem = JSON.parse(evento.data as string) as MensagemHub;
        } catch {
          return;
        }
        if (mensagem.tipo === 'snapshot') {
          if (mensagem.dados.revisao >= revisaoRef.current) {
            revisaoRef.current = mensagem.dados.revisao;
            setSnapshot(mensagem.dados);
          }
        } else if (mensagem.tipo === 'check') {
          const resultado = mensagem.dados;
          setResultadosCheck((atuais) => ({ ...atuais, [resultado.id]: resultado }));
        } else if (mensagem.tipo === 'aviso') {
          notificar(mensagem.texto, mensagem.nivel);
        } else if (mensagem.tipo === 'alerta') {
          const alerta = { id: `${mensagem.ts}-${Math.random().toString(36).slice(2)}`, texto: mensagem.texto, ts: mensagem.ts };
          setAlertas((atuais) => [...atuais, alerta]);
          vibrar([300, 150, 300]);
        } else if (mensagem.tipo === 'execucao') {
          const execucao = mensagem.dados;
          setAutomacoes((atual) => (atual ? { ...atual, ultimaExecucao: execucao } : atual));
          // Os próximos horários mudam depois de uma execução agendada.
          recarregarAutomacoes();
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (canceladoRef.current) return;
        setReconectando(true);
        agendarReconexao();
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    conectar();

    return () => {
      canceladoRef.current = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [autenticado, notificar, recarregarAutomacoes]);

  const entrar = useCallback(async (pin: string): Promise<{ ok: boolean; mensagem?: string }> => {
    try {
      await apiPost(ROTAS.login, { pin });
      setAutenticado(true);
      return { ok: true };
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'Não foi possível entrar.';
      return { ok: false, mensagem };
    }
  }, []);

  const valor: AppContextoValor = {
    autenticado,
    entrar,
    snapshot,
    reconectando,
    resultadosCheck,
    toasts,
    alertas,
    fecharAlerta,
    removerToast,
    notificar,
    tela,
    abrirTela,
    maquinaPedida,
    automacoes,
    recarregarAutomacoes,
  };

  return (
    <AppContexto.Provider value={valor}>
      <ProvedorSlots>{children}</ProvedorSlots>
    </AppContexto.Provider>
  );
}
