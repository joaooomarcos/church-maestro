import { useEffect, useMemo, useState } from 'react';
import { ROTAS } from '@maestro/shared';
import { useAppContexto, useControlesRodape } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

/** A imagem de um slide. Some sozinha se não existir (não há "próximo" no último slide). */
function ImagemSlide({ src, rotulo, classe }: { src: string; rotulo: string; classe: string }) {
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [src]);
  if (falhou) return null;
  return (
    <figure className={`visor-slides__quadro ${classe}`}>
      <img src={src} alt={rotulo} onError={() => setFalhou(true)} />
      <figcaption>{rotulo}</figcaption>
    </figure>
  );
}

export function PowerPoint() {
  const { snapshot } = useAppContexto();
  const dispositivos = useMemo(
    () => (snapshot?.dispositivos ?? []).filter((d) => d.powerpoint !== undefined),
    [snapshot],
  );
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Sobe a cada comando: a imagem do slide é pedida de novo na hora, sem esperar a próxima leitura do painel.
  const [comandos, setComandos] = useState(0);

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

  async function agir(acao: 'proximo' | 'anterior' | 'iniciar' | 'encerrar'): Promise<void> {
    if (!atual) return;
    vibrar(15);
    setEnviando(true);
    try {
      await apiPost(ROTAS.pptAcao, { dispositivo: atual.id, acao });
      setComandos((n) => n + 1);
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
          <p className="powerpoint__aviso">A apresentação não está no modo exibição.</p>
        ) : (
          <h2>
            Slide {atual?.powerpoint?.slide ?? '?'} de {atual?.powerpoint?.totalSlides ?? '?'}
          </h2>
        )}
      </div>

      {atual && online && emApresentacao ? (
        <div className="visor-slides">
          {(['atual', 'proximo'] as const).map((qual) => (
            <ImagemSlide
              key={qual}
              classe={`visor-slides__quadro--${qual}`}
              rotulo={qual === 'atual' ? 'No telão' : 'Próximo'}
              src={`${ROTAS.pptSlide}?dispositivo=${encodeURIComponent(atual.id)}&qual=${qual}&v=${
                atual.powerpoint?.slide ?? 0
              }-${comandos}-${encodeURIComponent(atual.powerpoint?.arquivo ?? '')}`}
            />
          ))}
        </div>
      ) : null}

      {online ? (
        <div className="holyrics__modos">
          <button
            type="button"
            className="holyrics__modo"
            disabled={enviando || emApresentacao}
            onClick={() => void agir('iniciar')}
          >
            <span>Iniciar apresentação</span>
            <span className="holyrics__tecla">F5</span>
          </button>
          <button
            type="button"
            className="holyrics__modo holyrics__modo--sair"
            disabled={enviando || !emApresentacao}
            onClick={() => void agir('encerrar')}
          >
            <span>Encerrar apresentação</span>
            <span className="holyrics__tecla">ESC</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
