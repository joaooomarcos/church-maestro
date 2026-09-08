import { useEffect, useMemo, useState } from 'react';
import { ROTAS } from '@maestro/shared';
import { useAppContexto, useControlesRodape } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

export function PowerPoint() {
  const { snapshot } = useAppContexto();
  const dispositivos = useMemo(
    () => (snapshot?.dispositivos ?? []).filter((d) => d.powerpoint !== undefined),
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
  const online = atual?.powerpoint?.online ?? false;
  const emApresentacao = atual?.powerpoint?.emApresentacao ?? false;

  async function agir(acao: 'proximo' | 'anterior' | 'iniciar'): Promise<void> {
    if (!atual) return;
    vibrar(15);
    setEnviando(true);
    try {
      await apiPost(ROTAS.pptAcao, { dispositivo: atual.id, acao });
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setEnviando(false);
    }
  }

  useControlesRodape(
    atual && online && emApresentacao ? (
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
    return <p className="powerpoint__vazio">Nenhum dispositivo com PowerPoint configurado.</p>;
  }

  return (
    <div className="powerpoint">
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

      <div className="powerpoint__status">
        {!online ? (
          <p>{atual?.powerpoint?.erro ?? 'Sem conexão com o PowerPoint.'}</p>
        ) : !emApresentacao ? (
          <>
            <p className="powerpoint__aviso">A apresentação não está no modo exibição.</p>
            <button type="button" className="botao-acao" disabled={enviando} onClick={() => void agir('iniciar')}>
              Iniciar apresentação
            </button>
          </>
        ) : (
          <h2>
            Slide {atual?.powerpoint?.slide ?? '?'} de {atual?.powerpoint?.totalSlides ?? '?'}
          </h2>
        )}
      </div>
    </div>
  );
}
