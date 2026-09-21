import { useCallback, useEffect, useState } from 'react';
import {
  APLICATIVOS,
  NOMES_APLICATIVOS,
  NOMES_MODOS,
  ROTAS,
  type Aplicativo,
  type EstadoConvidado,
  type ModoConvidado,
} from '@maestro/shared';
import { apiGet, apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { Icone } from '../componentes/Icone';

const INTERVALO_ESTADO_MS = 10_000;

/**
 * Tela de quem vai apresentar. Abre pelo QR code da máquina onde a apresentação
 * está aberta, pede o PIN de convidado uma vez e daí em diante é só avançar e
 * voltar. Não tem nada do painel: quem entra aqui não vê nem controla o resto.
 */
export function Convidado({ token }: { token: string }) {
  const [estado, setEstado] = useState<EstadoConvidado | null>(null);
  const [precisaPin, setPrecisaPin] = useState(false);
  const [pin, setPin] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [modo, setModo] = useState<ModoConvidado | null>(null);
  const [appAlvo, setAppAlvo] = useState<Aplicativo>('powerpoint');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const atual = await apiGet<EstadoConvidado>(ROTAS.convidadoEstado);
      setEstado(atual);
      setPrecisaPin(false);
      setModo((escolhido) => escolhido ?? atual.modos[0] ?? null);
    } catch {
      setPrecisaPin(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (precisaPin) return undefined;
    const timer = window.setInterval(() => void carregar(), INTERVALO_ESTADO_MS);
    return () => window.clearInterval(timer);
  }, [precisaPin, carregar]);

  async function entrar(evento: React.FormEvent): Promise<void> {
    evento.preventDefault();
    if (!pin || entrando) return;
    setEntrando(true);
    setErro(null);
    try {
      await apiPost(ROTAS.convidadoEntrar, { token, pin });
      setPin('');
      await carregar();
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não consegui entrar.');
    } finally {
      setEntrando(false);
    }
  }

  async function passar(acao: 'proximo' | 'anterior'): Promise<void> {
    if (!modo || enviando) return;
    vibrar(15);
    setEnviando(true);
    setErro(null);
    try {
      await apiPost(ROTAS.convidadoAcao, {
        modo,
        acao,
        ...(modo === 'teclado' ? { app: appAlvo } : {}),
      });
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não consegui passar o slide.');
    } finally {
      setEnviando(false);
    }
  }

  if (precisaPin) {
    return (
      <div className="convidado convidado--entrada">
        <h1 className="convidado__titulo">Controle de slides</h1>
        <p className="convidado__ajuda">Digite o PIN que a equipe passou para você.</p>
        <form className="convidado__form" onSubmit={(evento) => void entrar(evento)}>
          <input
            className="convidado__pin"
            type="tel"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="PIN"
            value={pin}
            onChange={(evento) => setPin(evento.target.value)}
          />
          <button type="submit" className="botao-acao" disabled={!pin || entrando}>
            {entrando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        {erro ? <p className="convidado__erro">{erro}</p> : null}
      </div>
    );
  }

  if (!estado) return <p className="painel__vazio">Carregando…</p>;

  const appsParaTeclado = estado.appsAbertos.length > 0 ? estado.appsAbertos : [...APLICATIVOS];

  return (
    <div className="convidado">
      <header className="convidado__cabecalho">
        <h1 className="convidado__titulo">{estado.dispositivoNome}</h1>
        {estado.resumo ? <p className="convidado__resumo">{estado.resumo}</p> : null}
      </header>

      {estado.modos.length > 1 ? (
        <div className="convidado__modos">
          {estado.modos.map((disponivel) => (
            <button
              key={disponivel}
              type="button"
              className={`convidado__modo${modo === disponivel ? ' convidado__modo--ativo' : ''}`}
              onClick={() => setModo(disponivel)}
            >
              {NOMES_MODOS[disponivel]}
            </button>
          ))}
        </div>
      ) : null}

      {modo === 'teclado' ? (
        <select
          className="versoes__select"
          value={appAlvo}
          onChange={(evento) => setAppAlvo(evento.target.value as Aplicativo)}
        >
          {appsParaTeclado.map((app) => (
            <option key={app} value={app}>
              Mandar as setas para {NOMES_APLICATIVOS[app]}
            </option>
          ))}
        </select>
      ) : null}

      <div className="convidado__botoes">
        <button
          type="button"
          className="convidado__passar"
          disabled={!modo || enviando}
          onClick={() => void passar('anterior')}
        >
          <Icone nome="seta-esquerda" tamanho={26} />
          Voltar
        </button>
        <button
          type="button"
          className="convidado__passar convidado__passar--principal"
          disabled={!modo || enviando}
          onClick={() => void passar('proximo')}
        >
          Avançar
          <Icone nome="seta-direita" tamanho={26} />
        </button>
      </div>

      {erro ? <p className="convidado__erro">{erro}</p> : null}
      {estado.modos.length === 0 ? (
        <p className="convidado__ajuda">
          Esta máquina não está pronta para receber comandos. Chame a equipe.
        </p>
      ) : null}
    </div>
  );
}
