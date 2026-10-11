import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROTAS, type ItemPlaylistHolyrics, type RespostaPlaylistHolyrics } from '@maestro/shared';
import { useAppContexto, useControlesCabecalho, useControlesRodape } from '../contexto/AppContext';
import { FaixaTitulo } from '../componentes/FaixaTitulo';
import { Icone } from '../componentes/Icone';
import { NavegacaoSlides } from '../componentes/NavegacaoSlides';
import { SeletorPc, usaPrograma } from '../componentes/SeletorPc';
import { apiGet, apiPost, TEMPO_LIMITE_COMANDO_MS } from '../nucleo/cliente';
import { useTelaAcesa } from '../nucleo/telaAcesa';
import { vibrar } from '../nucleo/vibrar';

type ModoTela = 'f8' | 'f9' | 'f10';

/** A lista de músicas muda pouco; reler de tempos em tempos pega o que a equipe mexeu no Holyrics. */
const INTERVALO_PLAYLIST_MS = 20_000;

const MODOS_TELA: ReadonlyArray<{ acao: ModoTela; rotulo: string; tecla: string }> = [
  { acao: 'f8', rotulo: 'Plano de fundo', tecla: 'F8' },
  { acao: 'f9', rotulo: 'Sem letra', tecla: 'F9' },
  { acao: 'f10', rotulo: 'Tela preta', tecla: 'F10' },
];

export function Holyrics() {
  const { snapshot, maquinaPedida } = useAppContexto();
  useTelaAcesa();
  const dispositivos = useMemo(
    () => (snapshot?.dispositivos ?? []).filter((d) => d.holyrics !== undefined && usaPrograma(d, 'holyrics')),
    [snapshot],
  );
  const [selecionadoId, setSelecionadoId] = useState<string | null>(() => maquinaPedida('holyrics'));
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

  const [playlist, setPlaylist] = useState<ItemPlaylistHolyrics[] | null>(null);
  const [erroPlaylist, setErroPlaylist] = useState(false);

  const carregarPlaylist = useCallback(async (id: string): Promise<void> => {
    try {
      const resposta = await apiGet<RespostaPlaylistHolyrics>(
        `${ROTAS.holyricsPlaylist}?dispositivo=${encodeURIComponent(id)}`,
      );
      setPlaylist(resposta.itens);
      setErroPlaylist(false);
    } catch {
      setErroPlaylist(true);
    }
  }, []);

  const atualId = atual?.id;
  useEffect(() => {
    setPlaylist(null);
    setErroPlaylist(false);
    if (!atualId || !online) return undefined;
    void carregarPlaylist(atualId);
    const timer = window.setInterval(() => void carregarPlaylist(atualId), INTERVALO_PLAYLIST_MS);
    return () => window.clearInterval(timer);
  }, [atualId, online, carregarPlaylist]);

  // A página do próprio Holyrics que desenha o telão. O celular abre direto
  // nela, então precisa estar na mesma rede da máquina.
  const [visor, setVisor] = useState<string | null>(null);
  useEffect(() => {
    setVisor(null);
    if (!atualId || !online) return undefined;
    let valido = true;
    apiGet<{ url: string | null }>(`${ROTAS.holyricsVisualizacao}?dispositivo=${encodeURIComponent(atualId)}`)
      .then((resposta) => {
        if (valido) setVisor(resposta.url);
      })
      .catch(() => {
        // sem o visor a tela segue funcionando
      });
    return () => {
      valido = false;
    };
  }, [atualId, online]);

  async function mostrarMusica(item: ItemPlaylistHolyrics): Promise<void> {
    if (!atual || enviando) return;
    vibrar(15);
    setEnviando(true);
    try {
      await apiPost(ROTAS.holyricsAcao, { dispositivo: atual.id, acao: 'mostrarLetra', letraId: item.id }, TEMPO_LIMITE_COMANDO_MS);
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setEnviando(false);
    }
  }

  async function agir(acao: 'proximo' | 'anterior'): Promise<void> {
    if (!atual) return;
    vibrar(15);
    setEnviando(true);
    try {
      await apiPost(ROTAS.holyricsAcao, { dispositivo: atual.id, acao }, TEMPO_LIMITE_COMANDO_MS);
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
      await apiPost(ROTAS.holyricsAcao, { dispositivo: id, acao: modo, ativar: ligar }, TEMPO_LIMITE_COMANDO_MS);
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
      await apiPost(ROTAS.holyricsAcao, { dispositivo: atual.id, acao: 'encerrar' }, TEMPO_LIMITE_COMANDO_MS);
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setEnviando(false);
    }
  }

  useControlesRodape(
    atual && online ? (
      <NavegacaoSlides
        desabilitado={enviando}
        aoAnterior={() => void agir('anterior')}
        aoProximo={() => void agir('proximo')}
      />
    ) : null,
  );

  useControlesCabecalho(
    <SeletorPc dispositivos={dispositivos} atual={selecionadoId} aoTrocar={setSelecionadoId} />,
  );

  if (dispositivos.length === 0) {
    return <p className="holyrics__vazio">Nenhum dispositivo com Holyrics configurado.</p>;
  }

  return (
    <div className="holyrics">
      {!online ? (
        <p className="info holyrics__status">{atual?.holyrics?.erro ?? 'Sem conexão com o Holyrics.'}</p>
      ) : apresentacao ? (
        <FaixaTitulo
          titulo={apresentacao.nome}
          complemento={playlist?.find((item) => item.id === apresentacao.id)?.artista}
          slide={apresentacao.slide ?? null}
          total={apresentacao.totalSlides ?? null}
        />
      ) : (
        <p className="info holyrics__status">Sem apresentação em exibição.</p>
      )}

      {atual && online && visor ? (
        <figure className="visor-slides__quadro visor-slides__quadro--atual visor-holyrics">
          <iframe src={visor} title={`Telão do Holyrics em ${atual.nome}`} />
          <figcaption>No telão</figcaption>
        </figure>
      ) : null}

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
              <Icone nome="fechar" tamanho={20} />
            </button>
          </div>
          <section className="holyrics__playlist">
            <h3 className="holyrics__playlist-titulo">Lista de reprodução</h3>
            {playlist === null ? (
              <p className="versoes__dica">
                {erroPlaylist ? 'Não consegui ler a lista de reprodução do Holyrics.' : 'Carregando a lista…'}
              </p>
            ) : playlist.length === 0 ? (
              <p className="versoes__dica">A lista de reprodução está vazia no Holyrics.</p>
            ) : (
              <ul className="holyrics__musicas">
                {playlist.map((item) => {
                  const noAr = apresentacao?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`holyrics__musica${noAr ? ' holyrics__musica--no-ar' : ''}`}
                        aria-current={noAr ? 'true' : undefined}
                        disabled={enviando}
                        onClick={() => void mostrarMusica(item)}
                      >
                        <span className="holyrics__musica-texto">
                          {item.titulo}
                          {item.artista ? <span className="holyrics__artista"> ({item.artista})</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="versoes__dica">
            F8, F9 e F10 funcionam como no teclado do Holyrics: toque de novo para desligar. Se
            alguém apertar a tecla direto na máquina, o botão aceso pode ficar trocado.
          </p>
        </>
      ) : null}
    </div>
  );
}
