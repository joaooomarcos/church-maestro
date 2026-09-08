import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MensagemHub, ResultadoCheck, Snapshot } from '@maestro/shared';
import { ROTAS } from '@maestro/shared';
import { apiGet, apiPost, definirOuvinteNaoAutenticado, ouvirErros } from '../nucleo/cliente';

type NivelToast = 'info' | 'alerta' | 'erro';

interface Toast {
  id: string;
  mensagem: string;
  nivel: NivelToast;
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
  removerToast: (id: string) => void;
  notificar: (mensagem: string, nivel?: NivelToast) => void;
  controlesRodape: ReactNode | null;
  definirControlesRodape: (node: ReactNode | null) => void;
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
  const { definirControlesRodape } = useAppContexto();
  useEffect(() => {
    definirControlesRodape(node);
    return () => definirControlesRodape(null);
  });
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [autenticado, setAutenticado] = useState<boolean | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reconectando, setReconectando] = useState(false);
  const [resultadosCheck, setResultadosCheck] = useState<Record<string, ResultadoCheck>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [controlesRodape, setControlesRodape] = useState<ReactNode | null>(null);

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

  const definirControlesRodape = useCallback((node: ReactNode | null) => {
    setControlesRodape(node);
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
  }, [autenticado, notificar]);

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
    removerToast,
    notificar,
    controlesRodape,
    definirControlesRodape,
  };

  return <AppContexto.Provider value={valor}>{children}</AppContexto.Provider>;
}
