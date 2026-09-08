import { useEffect, useMemo, useState } from 'react';
import { ROTAS } from '@maestro/shared';
import { useAppContexto, useControlesRodape } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

export function Holyrics() {
  const { snapshot } = useAppContexto();
  const dispositivos = useMemo(
    () => (snapshot?.dispositivos ?? []).filter((d) => d.holyrics !== undefined),
    [snapshot],
  );
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

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
    </div>
  );
}
