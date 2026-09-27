import { useEffect, useMemo, useState } from 'react';
import { ROTAS } from '@maestro/shared';
import { useAppContexto, useControlesRodape } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

type ModoTela = 'f8' | 'f9' | 'f10';

const MODOS_TELA: ReadonlyArray<{ acao: ModoTela; rotulo: string; tecla: string }> = [
  { acao: 'f8', rotulo: 'Plano de fundo', tecla: 'F8' },
  { acao: 'f9', rotulo: 'Sem letra', tecla: 'F9' },
  { acao: 'f10', rotulo: 'Tela preta', tecla: 'F10' },
];

export function Holyrics() {
  const { snapshot } = useAppContexto();
  const dispositivos = useMemo(
    () => (snapshot?.dispositivos ?? []).filter((d) => d.holyrics !== undefined),
    [snapshot],
  );
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // A API do Holyrics liga e desliga F8/F9/F10, mas não diz o estado atual.
  // Guardamos o que foi mandado daqui, por máquina, para o botão funcionar como
  // a tecla: toca para ligar, toca de novo para desligar.
  const [modosLigados, setModosLigados] = useState<Record<string, Partial<Record<ModoTela, boolean>>>>({});

  useEffect(() => {
    if (dispositivos.length === 0) {
      setSelecionadoId(null);
      return;
    }
    if (!selecionadoId || !dispositivos.some((d) => d.id === selecionadoId)) {
      setSelecionadoId(dispositivos[0]?.id ?? null);
    }
  }, [dispositivos, selecionadoId]);

  const atual = dispositivos.find((d) => d.id === selecionadoId) ?? null;
  const apresentacao = atual?.holyrics?.apresentacao ?? null;
  const online = atual?.holyrics?.online ?? false;

  async function agir(acao: 'proximo' | 'anterior'): Promise<void> {
    if (!atual) return;
    vibrar(15);
    setEnviando(true);
    try {
      await apiPost(ROTAS.holyricsAcao, { dispositivo: atual.id, acao });
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setEnviando(false);
    }
  }

  async function alternarModo(modo: ModoTela): Promise<void> {
    if (!atual || enviando) return;
    const id = atual.id;
    const ligar = !(modosLigados[id]?.[modo] ?? false);
    vibrar(15);
    setModosLigados((todos) => ({ ...todos, [id]: { ...todos[id], [modo]: ligar } }));
    setEnviando(true);
    try {
      await apiPost(ROTAS.holyricsAcao, { dispositivo: id, acao: modo, ativar: ligar });
    } catch {
      setModosLigados((todos) => ({ ...todos, [id]: { ...todos[id], [modo]: !ligar } }));
    } finally {
      setEnviando(false);
    }
  }

  async function sair(): Promise<void> {
    if (!atual || enviando) return;
    vibrar(15);
    setEnviando(true);
    try {
      await apiPost(ROTAS.holyricsAcao, { dispositivo: atual.id, acao: 'encerrar' });
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setEnviando(false);
    }
  }

  useControlesRodape(
    atual && online ? (
      <div className="botoes-gigantes">
        <button type="button" className="botao-gigante" disabled={enviando} onClick={() => void agir('anterior')}>
          ‹ ANTERIOR
        </button>
        <button type="button" className="botao-gigante" disabled={enviando} onClick={() => void agir('proximo')}>
          PRÓXIMO ›
        </button>
      </div>
    ) : null,
  );

  if (dispositivos.length === 0) {
    return <p className="holyrics__vazio">Nenhum dispositivo com Holyrics configurado.</p>;
  }

  return (
    <div className="holyrics">
      {dispositivos.length > 1 ? (
        <div className="seletor-dispositivo">
          {dispositivos.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`botao-opcao${d.id === selecionadoId ? ' botao-opcao--ativo' : ''}`}
              onClick={() => setSelecionadoId(d.id)}
            >
              {d.nome}
            </button>
          ))}
        </div>
      ) : null}

      <div className="holyrics__status">
        {!online ? (
          <p>{atual?.holyrics?.erro ?? 'Sem conexão com o Holyrics.'}</p>
        ) : apresentacao ? (
          <>
            <h2>{apresentacao.nome}</h2>
            <p>
              Slide {apresentacao.slide ?? '?'} de {apresentacao.totalSlides ?? '?'}
            </p>
          </>
        ) : (
          <p>Sem apresentação em exibição.</p>
        )}
      </div>

      {atual && online ? (
        <>
          <div className="holyrics__modos">
            {MODOS_TELA.map((modo) => {
              const ligado = modosLigados[atual.id]?.[modo.acao] ?? false;
              return (
                <button
                  key={modo.acao}
                  type="button"
                  className={`holyrics__modo${ligado ? ' holyrics__modo--ligado' : ''}`}
                  aria-pressed={ligado}
                  disabled={enviando}
                  onClick={() => void alternarModo(modo.acao)}
                >
                  <span>{modo.rotulo}</span>
                  <span className="holyrics__tecla">{modo.tecla}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="holyrics__modo holyrics__modo--sair"
              disabled={enviando}
              onClick={() => void sair()}
            >
              <span>Sair</span>
              <span className="holyrics__tecla">ESC</span>
            </button>
          </div>
          <p className="versoes__dica">
            F8, F9 e F10 funcionam como no teclado do Holyrics: toque de novo para desligar. Se
            alguém apertar a tecla direto na máquina, o botão aceso pode ficar trocado.
          </p>
        </>
      ) : null}
    </div>
  );
}
