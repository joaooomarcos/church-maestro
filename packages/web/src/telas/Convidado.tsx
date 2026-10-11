import { useCallback, useEffect, useState } from 'react';
import {
  ACOES_COM_CONFIRMACAO,
  NOMES_MODOS,
  ROTAS,
  type EstadoConvidado,
  type ItemPlaylistHolyrics,
  type ModoConvidado,
  type NomeAcaoConvidado,
  type RespostaPlaylistHolyrics,
} from '@maestro/shared';
import { ErroRequisicao, TEMPO_LIMITE_COMANDO_MS, apiGet, apiPost } from '../nucleo/cliente';
import { useAoVoltar, useTelaAcesa } from '../nucleo/telaAcesa';
import { vibrar } from '../nucleo/vibrar';
import { FaixaTitulo } from '../componentes/FaixaTitulo';
import { Icone } from '../componentes/Icone';
import { NavegacaoSlides } from '../componentes/NavegacaoSlides';
import { TecladoPin } from '../componentes/TecladoPin';
import '../estilos/convidado.css';

const INTERVALO_ESTADO_MS = 10_000;
/** No controle completo o número do slide e a prévia precisam acompanhar de perto. */
const INTERVALO_ESTADO_COMPLETO_MS = 3_000;
const INTERVALO_PLAYLIST_MS = 20_000;

type ModoTela = 'f8' | 'f9' | 'f10';

const MODOS_TELA: ReadonlyArray<{ acao: ModoTela; rotulo: string; tecla: string }> = [
  { acao: 'f8', rotulo: 'Plano de fundo', tecla: 'F8' },
  { acao: 'f9', rotulo: 'Sem letra', tecla: 'F9' },
  { acao: 'f10', rotulo: 'Tela preta', tecla: 'F10' },
];

const PERGUNTA_DA_ACAO: Partial<Record<NomeAcaoConvidado, Record<ModoConvidado, string>>> = {
  encerrar: {
    holyrics: 'Sair da apresentação?',
    powerpoint: 'Encerrar a apresentação?',
    teclado: 'Encerrar a apresentação?',
  },
  f10: { holyrics: 'Ligar a tela preta?', powerpoint: 'Ligar a tela preta?', teclado: 'Ligar a tela preta?' },
};

/** Imagem de um slide; some sozinha se não existir (não há "próximo" no último slide). */
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

interface PedidoConfirmacao {
  pergunta: string;
  executar: () => void;
}

/**
 * Tela de quem vai apresentar. Abre pelo QR code, pede o PIN uma vez e daí em
 * diante é só avançar e voltar — ou, se a equipe liberou o controle completo,
 * também a lista de reprodução, as telas do Holyrics e a prévia do PowerPoint.
 * Não tem nada do painel. O que cada link pode fazer é decidido no servidor.
 */
export function Convidado({ token }: { token: string }) {
  const [estado, setEstado] = useState<EstadoConvidado | null>(null);
  const [precisaPin, setPrecisaPin] = useState(false);
  const [modo, setModo] = useState<ModoConvidado | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<PedidoConfirmacao | null>(null);
  const [playlist, setPlaylist] = useState<ItemPlaylistHolyrics[] | null>(null);
  const [erroPlaylist, setErroPlaylist] = useState(false);
  const [modosLigados, setModosLigados] = useState<Partial<Record<ModoTela, boolean>>>({});
  const [comandos, setComandos] = useState(0);
  const [semConexao, setSemConexao] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const atual = await apiGet<EstadoConvidado>(
        `${ROTAS.convidadoEstado}?token=${token}`,
        TEMPO_LIMITE_COMANDO_MS,
      );
      setEstado(atual);
      setPrecisaPin(false);
      setSemConexao(false);
      setModo((escolhido) => (escolhido && atual.modos.includes(escolhido) ? escolhido : (atual.modos[0] ?? null)));
    } catch (falha) {
      // Só o "não autorizado" do hub pede o PIN de novo. Wi-fi que caiu ou hub
      // que demorou não: a tela fica como está e tenta de novo sozinha.
      if (falha instanceof ErroRequisicao && falha.status === 401) {
        setSemConexao(false);
        setPrecisaPin(true);
      } else {
        setSemConexao(true);
      }
    }
  }, [token]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Celular desbloqueado ou wi-fi de volta: atualiza na hora.
  useAoVoltar(carregar);
  useTelaAcesa(!precisaPin);

  // Sem conexão, insiste de 2 em 2 segundos até o hub responder.
  useEffect(() => {
    if (!semConexao) return undefined;
    const timer = window.setInterval(() => void carregar(), 2000);
    return () => window.clearInterval(timer);
  }, [semConexao, carregar]);

  const completo = estado?.completo === true;

  useEffect(() => {
    if (precisaPin) return undefined;
    const timer = window.setInterval(
      () => void carregar(),
      completo ? INTERVALO_ESTADO_COMPLETO_MS : INTERVALO_ESTADO_MS,
    );
    return () => window.clearInterval(timer);
  }, [precisaPin, completo, carregar]);

  const lerPlaylist = completo && modo === 'holyrics';
  useEffect(() => {
    setPlaylist(null);
    setErroPlaylist(false);
    if (!lerPlaylist) return undefined;
    let valido = true;
    const buscar = (): void => {
      apiGet<RespostaPlaylistHolyrics>(`${ROTAS.convidadoPlaylist}?token=${token}`)
        .then((resposta) => {
          if (!valido) return;
          setPlaylist(resposta.itens);
          setErroPlaylist(false);
        })
        .catch(() => {
          if (valido) setErroPlaylist(true);
        });
    };
    buscar();
    const timer = window.setInterval(buscar, INTERVALO_PLAYLIST_MS);
    return () => {
      valido = false;
      window.clearInterval(timer);
    };
  }, [lerPlaylist, token]);

  /** Devolve a mensagem de erro (ou nada, se entrou). */
  async function entrar(pinDigitado: string): Promise<string | null> {
    try {
      await apiPost(ROTAS.convidadoEntrar, { token, pin: pinDigitado });
      await carregar();
      return null;
    } catch (falha) {
      return falha instanceof Error ? falha.message : 'Não consegui entrar.';
    }
  }

  /** Manda o comando; devolve se o hub aceitou. */
  async function enviar(
    acao: NomeAcaoConvidado,
    extra: { letraId?: string; ativar?: boolean } = {},
  ): Promise<boolean> {
    if (!modo || enviando) return false;
    vibrar(15);
    setEnviando(true);
    setErro(null);
    try {
      await apiPost(`${ROTAS.convidadoAcao}?token=${token}`, { modo, acao, ...extra }, TEMPO_LIMITE_COMANDO_MS);
      setComandos((n) => n + 1);
      void carregar();
      return true;
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não consegui enviar o comando.');
      void carregar();
      return false;
    } finally {
      setEnviando(false);
    }
  }

  /** Ações pesadas pedem confirmação, só aqui na página do convidado. */
  function comConfirmacao(acao: NomeAcaoConvidado, executar: () => void): void {
    const pergunta = modo ? PERGUNTA_DA_ACAO[acao]?.[modo] : undefined;
    if (ACOES_COM_CONFIRMACAO.includes(acao) && pergunta) {
      vibrar(10);
      setConfirmacao({ pergunta, executar });
    } else {
      executar();
    }
  }

  async function alternarModoTela(acao: ModoTela): Promise<void> {
    const ligar = !(modosLigados[acao] ?? false);
    const rodar = async (): Promise<void> => {
      setModosLigados((todos) => ({ ...todos, [acao]: ligar }));
      const ok = await enviar(acao, { ativar: ligar });
      if (!ok) setModosLigados((todos) => ({ ...todos, [acao]: !ligar }));
    };
    // Só ligar a tela preta pede confirmação; desligar é voltar ao normal.
    if (ligar) comConfirmacao(acao, () => void rodar());
    else await rodar();
  }

  if (precisaPin) {
    return (
      <div className="convidado convidado--entrada">
        <h1 className="convidado__titulo">Controle de slides</h1>
        <p className="convidado__ajuda">Digite o PIN que a equipe passou para você.</p>
        <TecladoPin aoCompletar={entrar} />
      </div>
    );
  }

  if (!estado) {
    return (
      <p className="painel__vazio">
        {semConexao ? 'Sem conexão com o painel. Confira se o celular está no wi-fi da igreja.' : 'Carregando…'}
      </p>
    );
  }

  const noAr = estado.holyrics?.noAr ?? null;
  const ppt = estado.powerpoint;

  return (
    <div className={`convidado${completo ? ' convidado--completo' : ''}`}>
      {semConexao ? (
        <p className="convidado__sem-conexao" role="status">
          Sem conexão com o painel. Tentando de novo…
        </p>
      ) : null}

      <header className="convidado__cabecalho">
        <h1 className="convidado__titulo">{estado.nomeLink ?? estado.dispositivoNome}</h1>
        {estado.resumo && !completo ? <p className="convidado__resumo">{estado.resumo}</p> : null}
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

      {completo && modo === 'holyrics' ? (
        <div className="convidado__bloco">
          {!estado.holyrics?.online ? (
            <p className="info">Sem conexão com o Holyrics.</p>
          ) : noAr ? (
            <FaixaTitulo
              titulo={noAr.nome}
              complemento={playlist?.find((item) => item.id === noAr.id)?.artista}
              slide={noAr.slide}
              total={noAr.totalSlides}
            />
          ) : (
            <p className="info">Sem apresentação em exibição.</p>
          )}

          <div className="holyrics__modos">
            {MODOS_TELA.map((m) => {
              const ligado = modosLigados[m.acao] ?? false;
              return (
                <button
                  key={m.acao}
                  type="button"
                  className={`holyrics__modo${ligado ? ' holyrics__modo--ligado' : ''}`}
                  aria-pressed={ligado}
                  disabled={enviando}
                  onClick={() => void alternarModoTela(m.acao)}
                >
                  <span>{m.rotulo}</span>
                  <span className="holyrics__tecla">{m.tecla}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="holyrics__modo holyrics__modo--sair"
              disabled={enviando}
              onClick={() => comConfirmacao('encerrar', () => void enviar('encerrar'))}
            >
              <span>Sair</span>
              <Icone nome="fechar" tamanho={20} />
            </button>
          </div>

          <section className="holyrics__playlist">
            <h3 className="holyrics__playlist-titulo">Lista de reprodução</h3>
            {playlist === null ? (
              <p className="versoes__dica">
                {erroPlaylist ? 'Não consegui ler a lista de reprodução.' : 'Carregando a lista…'}
              </p>
            ) : playlist.length === 0 ? (
              <p className="versoes__dica">A lista de reprodução está vazia.</p>
            ) : (
              <ul className="holyrics__musicas">
                {playlist.map((item) => {
                  const tocando = noAr?.id === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`holyrics__musica${tocando ? ' holyrics__musica--no-ar' : ''}`}
                        aria-current={tocando ? 'true' : undefined}
                        disabled={enviando}
                        onClick={() => void enviar('mostrarLetra', { letraId: item.id })}
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
        </div>
      ) : null}

      {completo && modo === 'powerpoint' ? (
        <div className="convidado__bloco">
          {!ppt?.online ? (
            <p className="info">Sem conexão com o PowerPoint.</p>
          ) : !ppt.emApresentacao ? (
            <p className="info">A apresentação não está no modo exibição.</p>
          ) : (
            <FaixaTitulo titulo={ppt.arquivo ?? 'Apresentação'} slide={ppt.slide} total={ppt.totalSlides} />
          )}

          {ppt?.online && ppt.emApresentacao ? (
            <div className="visor-slides">
              {(['atual', 'proximo'] as const).map((qual) => (
                <ImagemSlide
                  key={qual}
                  classe={`visor-slides__quadro--${qual}`}
                  rotulo={qual === 'atual' ? 'No telão' : 'Próximo'}
                  src={`${ROTAS.convidadoSlide}?token=${token}&qual=${qual}&v=${ppt.slide ?? 0}-${comandos}-${encodeURIComponent(
                    ppt.arquivo ?? '',
                  )}`}
                />
              ))}
            </div>
          ) : null}

          {ppt?.online ? (
            <div className="holyrics__modos">
              <button
                type="button"
                className="holyrics__modo"
                disabled={enviando || ppt.emApresentacao}
                onClick={() => void enviar('iniciar')}
              >
                <span>Iniciar apresentação</span>
                <Icone nome="abrir" tamanho={20} />
              </button>
              <button
                type="button"
                className="holyrics__modo holyrics__modo--sair"
                disabled={enviando || !ppt.emApresentacao}
                onClick={() => comConfirmacao('encerrar', () => void enviar('encerrar'))}
              >
                <span>Encerrar apresentação</span>
                <Icone nome="fechar" tamanho={20} />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {completo && modo !== 'teclado' ? (
        <div className="convidado__rodape-nav">
          <NavegacaoSlides
            desabilitado={!modo || enviando}
            aoAnterior={() => void enviar('anterior')}
            aoProximo={() => void enviar('proximo')}
          />
        </div>
      ) : (
        <div className="convidado__botoes">
          <button
            type="button"
            className="convidado__passar"
            disabled={!modo || enviando}
            onClick={() => void enviar('anterior')}
          >
            <Icone nome="seta-esquerda" tamanho={26} />
            Voltar
          </button>
          <button
            type="button"
            className="convidado__passar convidado__passar--principal"
            disabled={!modo || enviando}
            onClick={() => void enviar('proximo')}
          >
            Avançar
            <Icone nome="seta-direita" tamanho={26} />
          </button>
        </div>
      )}

      {erro ? <p className="convidado__erro">{erro}</p> : null}
      {estado.modos.length === 0 ? (
        <p className="convidado__ajuda">
          Esta máquina não está pronta para receber comandos. Chame a equipe.
        </p>
      ) : null}

      {confirmacao ? (
        <div className="convidado-confirma" role="dialog" aria-modal="true" aria-label={confirmacao.pergunta}>
          <div className="convidado-confirma__caixa">
            <p className="convidado-confirma__pergunta">{confirmacao.pergunta}</p>
            <div className="convidado-confirma__botoes">
              <button type="button" className="tocavel" onClick={() => setConfirmacao(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="botao-acao"
                onClick={() => {
                  const { executar } = confirmacao;
                  setConfirmacao(null);
                  executar();
                }}
              >
                Sim
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
