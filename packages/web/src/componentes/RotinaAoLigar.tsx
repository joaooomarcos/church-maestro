import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ACOES_APP,
  APLICATIVOS,
  NOMES_APLICATIVOS,
  ROTAS,
  type AcaoApp,
  type EstadoDispositivo,
  type PassoAoLigar,
  type RespostaAoLigar,
  type RotinaAoLigar,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPost, apiPut } from '../nucleo/cliente';
import '../estilos/painel.css';

const NOMES_ACOES: Record<AcaoApp, string> = {
  abrir: 'Abrir',
  fechar: 'Fechar',
  reiniciar: 'Reiniciar',
  frente: 'Trazer para frente',
};

type TipoPasso = PassoAoLigar['tipo'];

const NOMES_PASSOS: Record<TipoPasso, string> = {
  'app.acao': 'Programa: abrir, fechar…',
  'chrome.abrir': 'Chrome: abrir uma página',
  'ndi.definirFonte': 'NDI: trocar a fonte',
  'holyrics.f8': 'Holyrics: plano de fundo (F8)',
  'holyrics.encerrarApresentacao': 'Holyrics: fechar apresentação',
  aviso: 'Aviso na tela',
  espera: 'Esperar um tempo',
};

function novoPasso(tipo: TipoPasso): PassoAoLigar {
  switch (tipo) {
    case 'app.acao':
      return { tipo, app: 'holyrics', acao: 'abrir', esperarPronto: true };
    case 'chrome.abrir':
      return { tipo, url: 'https://' };
    case 'ndi.definirFonte':
      return { tipo, porta: 80, fonte: null };
    case 'holyrics.f8':
      return { tipo, ativar: true };
    case 'holyrics.encerrarApresentacao':
      return { tipo };
    case 'aviso':
      return { tipo, mensagem: '', segundos: null };
    case 'espera':
      return { tipo, ms: 5000 };
  }
}

const INTERVALO_LEITURA_MS = 3000;

function quando(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function EditorPasso({ passo, aoMudar }: { passo: PassoAoLigar; aoMudar: (novo: PassoAoLigar) => void }) {
  switch (passo.tipo) {
    case 'app.acao':
      return (
        <>
          <select
            className="versoes__select"
            aria-label="Ação"
            value={passo.acao}
            onChange={(e) => aoMudar({ ...passo, acao: e.target.value as AcaoApp })}
          >
            {ACOES_APP.map((acao) => (
              <option key={acao} value={acao}>
                {NOMES_ACOES[acao]}
              </option>
            ))}
          </select>
          <select
            className="versoes__select"
            aria-label="Programa"
            value={passo.app}
            onChange={(e) => aoMudar({ ...passo, app: e.target.value as (typeof APLICATIVOS)[number] })}
          >
            {APLICATIVOS.map((app) => (
              <option key={app} value={app}>
                {NOMES_APLICATIVOS[app]}
              </option>
            ))}
          </select>
          {passo.acao === 'abrir' || passo.acao === 'reiniciar' ? (
            <label className="campo__rotulo">
              <input
                type="checkbox"
                checked={passo.esperarPronto === true}
                onChange={(e) => aoMudar({ ...passo, esperarPronto: e.target.checked })}
              />{' '}
              esperar ficar pronto (o resto só roda se ficar)
            </label>
          ) : null}
        </>
      );
    case 'chrome.abrir':
      return (
        <input
          className="campo__entrada"
          type="text"
          placeholder="Endereço da página, ex.: https://youtube.com/…"
          aria-label="Endereço da página"
          maxLength={2000}
          value={passo.url}
          onChange={(e) => aoMudar({ ...passo, url: e.target.value.trim() })}
        />
      );
    case 'ndi.definirFonte':
      return (
        <>
          <input
            className="campo__entrada"
            type="number"
            min={1}
            aria-label="Janela (porta) do Studio Monitor"
            value={passo.porta}
            onChange={(e) => aoMudar({ ...passo, porta: Math.max(1, Math.round(Number(e.target.value)) || 80) })}
          />
          <input
            className="campo__entrada"
            type="text"
            placeholder="Nome exato da fonte NDI (vazio = nenhuma)"
            aria-label="Fonte NDI"
            value={passo.fonte ?? ''}
            onChange={(e) => aoMudar({ ...passo, fonte: e.target.value.trim() === '' ? null : e.target.value })}
          />
        </>
      );
    case 'holyrics.f8':
      return (
        <select
          className="versoes__select"
          aria-label="Plano de fundo"
          value={passo.ativar ? '1' : '0'}
          onChange={(e) => aoMudar({ ...passo, ativar: e.target.value === '1' })}
        >
          <option value="1">Ligar o plano de fundo</option>
          <option value="0">Desligar o plano de fundo</option>
        </select>
      );
    case 'holyrics.encerrarApresentacao':
      return <span className="campo__rotulo">Fecha a apresentação que estiver no ar.</span>;
    case 'aviso':
      return (
        <>
          <input
            className="campo__entrada"
            type="text"
            maxLength={300}
            placeholder="Mensagem"
            aria-label="Mensagem do aviso"
            value={passo.mensagem}
            onChange={(e) => aoMudar({ ...passo, mensagem: e.target.value })}
          />
          <input
            className="campo__entrada"
            type="number"
            min={1}
            max={600}
            placeholder="segundos"
            aria-label="Some sozinho depois de (segundos); vazio = até clicar em Ok"
            value={passo.segundos ?? ''}
            onChange={(e) =>
              aoMudar({
                ...passo,
                segundos: e.target.value === '' ? null : Math.min(600, Math.max(1, Math.round(Number(e.target.value)) || 1)),
              })
            }
          />
        </>
      );
    case 'espera':
      return (
        <label className="campo__rotulo">
          <input
            className="campo__entrada"
            type="number"
            min={0.1}
            step="any"
            aria-label="Segundos de espera"
            value={passo.ms / 1000}
            onChange={(e) =>
              aoMudar({ ...passo, ms: Math.min(300_000, Math.max(100, Math.round(Number(e.target.value) * 1000) || 1000)) })
            }
          />{' '}
          segundos
        </label>
      );
  }
}

function Resultado({ resposta }: { resposta: RespostaAoLigar }) {
  if (resposta.executando) return <p className="pc-detalhe__rotulo">Rodando agora…</p>;
  const execucao = resposta.ultimaExecucao;
  if (!execucao) return null;
  return (
    <div role="status">
      <p className="pc-detalhe__rotulo">
        Última vez: {quando(execucao.ts)} ({execucao.origem === 'boot' ? 'ao ligar' : 'teste'}) —{' '}
        {execucao.ok ? 'tudo certo' : 'com falhas'}
      </p>
      <ul>
        {execucao.passos.map((passo, i) => (
          <li key={i} className="pc-detalhe__rotulo">
            {passo.ok ? '✓' : passo.pulado ? '–' : '✗'} {passo.descricao}
            {passo.erro ? `: ${passo.erro}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "Ao ligar": o que a máquina faz sozinha quando liga. A rotina mora no agente
 * dela e roda mesmo com o hub desligado; aqui o painel lê e edita por ele, então
 * só funciona com a máquina ligada.
 */
export function RotinaAoLigarMaquina({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const { notificar } = useAppContexto();
  const caminho = ROTAS.aoLigarDaMaquina.replace(':id', encodeURIComponent(dispositivo.id));
  const [resposta, setResposta] = useState<RespostaAoLigar | null>(null);
  const [rascunho, setRascunho] = useState<RotinaAoLigar | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [novoTipo, setNovoTipo] = useState<TipoPasso>('app.acao');
  // Lido de dentro do temporizador, que não enxerga o estado de quando foi criado.
  const sujoRef = useRef(false);
  const [sujo, setSujo] = useState(false);

  const marcarSujo = (valor: boolean) => {
    sujoRef.current = valor;
    setSujo(valor);
  };

  const carregar = useCallback(async () => {
    try {
      const lida = await apiGet<RespostaAoLigar>(caminho);
      setResposta(lida);
      setIndisponivel(false);
      if (!sujoRef.current) setRascunho(lida.rotina);
    } catch {
      // o erro já virou aviso; agente antigo ou máquina sem resposta
      setIndisponivel(true);
    }
  }, [caminho]);

  useEffect(() => {
    setResposta(null);
    setRascunho(null);
    marcarSujo(false);
    setIndisponivel(false);
    if (!dispositivo.online) return undefined;
    void carregar();
    const timer = window.setInterval(() => {
      // Parou de responder uma vez: não fica enchendo a tela de aviso a cada leitura.
      if (!document.hidden) void carregar();
    }, INTERVALO_LEITURA_MS);
    return () => window.clearInterval(timer);
  }, [dispositivo.id, dispositivo.online, carregar]);

  async function salvar(): Promise<boolean> {
    if (!rascunho) return false;
    const vazio = rascunho.passos.findIndex((p) => p.tipo === 'aviso' && p.mensagem.trim() === '');
    if (vazio >= 0) {
      notificar(`O passo ${vazio + 1} (aviso) está sem mensagem.`, 'alerta');
      return false;
    }
    setSalvando(true);
    try {
      const nova = await apiPut<RespostaAoLigar>(caminho, rascunho);
      setResposta(nova);
      setRascunho(nova.rotina);
      marcarSujo(false);
      notificar('Rotina salva na máquina.', 'info');
      return true;
    } catch {
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function testar(): Promise<void> {
    // Testa o que está na tela: salva antes, para não rodar uma versão que ninguém está vendo.
    if (sujo && !(await salvar())) return;
    try {
      await apiPost(`${caminho}/testar`);
      await carregar();
    } catch {
      // o erro já virou aviso
    }
  }

  function mudar(proximo: Partial<RotinaAoLigar>) {
    setRascunho((atual) => (atual ? { ...atual, ...proximo } : atual));
    marcarSujo(true);
  }

  function mudarPasso(indice: number, passo: PassoAoLigar) {
    if (!rascunho) return;
    mudar({ passos: rascunho.passos.map((p, i) => (i === indice ? passo : p)) });
  }

  function mover(de: number, para: number) {
    if (!rascunho) return;
    const passos = [...rascunho.passos];
    const [tirado] = passos.splice(de, 1);
    if (tirado) passos.splice(para, 0, tirado);
    mudar({ passos });
  }

  let corpo;
  if (!dispositivo.online) {
    corpo = (
      <p className="pc-detalhe__rotulo">
        A rotina fica guardada na própria máquina. Ligue {dispositivo.nome} para ver ou mudar.
      </p>
    );
  } else if (indisponivel && !rascunho) {
    corpo = (
      <p className="pc-detalhe__rotulo">
        Não consegui ler a rotina deste agente. Se ele for de uma versão anterior à 0.11, atualize-o.
      </p>
    );
  } else if (!rascunho || !resposta) {
    corpo = <p className="pc-detalhe__rotulo">Carregando…</p>;
  } else {
    corpo = (
      <>
        <label className="campo__rotulo">
          <input type="checkbox" checked={rascunho.ativo} onChange={(e) => mudar({ ativo: e.target.checked })} /> Rodar
          quando a máquina ligar
        </label>
        <label className="campo">
          <span className="campo__rotulo">Esperar depois de ligar (segundos)</span>
          <input
            className="campo__entrada"
            type="number"
            min={0}
            max={600}
            value={rascunho.esperaSegundos}
            onChange={(e) => {
              const valor = Math.round(Number(e.target.value));
              mudar({ esperaSegundos: Number.isFinite(valor) ? Math.min(600, Math.max(0, valor)) : 0 });
            }}
          />
        </label>

        {rascunho.passos.length === 0 ? (
          <p className="painel__vazio">Nenhum passo ainda.</p>
        ) : (
          <ol className="lista-cenarios">
            {rascunho.passos.map((passo, indice) => (
              <li key={indice} className="cartao-cenario">
                <div className="cartao-cenario__texto">
                  <p className="cartao-cenario__nome">
                    {indice + 1}. {NOMES_PASSOS[passo.tipo]}
                  </p>
                  <div className="cenario-editor">
                    <EditorPasso passo={passo} aoMudar={(novo) => mudarPasso(indice, novo)} />
                  </div>
                </div>
                <div className="cartao-cenario__acoes">
                  <button
                    type="button"
                    className="botao-secundario"
                    aria-label={`Subir o passo ${indice + 1}`}
                    disabled={indice === 0}
                    onClick={() => mover(indice, indice - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="botao-secundario"
                    aria-label={`Descer o passo ${indice + 1}`}
                    disabled={indice === rascunho.passos.length - 1}
                    onClick={() => mover(indice, indice + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="botao-secundario botao-secundario--perigo"
                    aria-label={`Remover o passo ${indice + 1}`}
                    onClick={() => mudar({ passos: rascunho.passos.filter((_, i) => i !== indice) })}
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="cenario-editor__rodape">
          <select
            className="versoes__select"
            aria-label="Tipo do novo passo"
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value as TipoPasso)}
          >
            {(Object.keys(NOMES_PASSOS) as TipoPasso[]).map((tipo) => (
              <option key={tipo} value={tipo}>
                {NOMES_PASSOS[tipo]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="botao-secundario"
            onClick={() => mudar({ passos: [...rascunho.passos, novoPasso(novoTipo)] })}
          >
            Adicionar passo
          </button>
        </div>
        <div className="cenario-editor__rodape">
          <button type="button" className="botao-acao" disabled={salvando || !sujo} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            type="button"
            className="botao-secundario"
            disabled={salvando || resposta.executando}
            title="Roda agora, sem esperar a máquina ligar"
            onClick={() => void testar()}
          >
            Testar agora
          </button>
          {sujo ? <span className="pc-detalhe__rotulo">Alterações não salvas.</span> : null}
        </div>
        <Resultado resposta={resposta} />
      </>
    );
  }

  return (
    <section className="info pc-detalhe__rede" aria-label="Ao ligar">
      <h3 className="pc-detalhe__titulo">Ao ligar</h3>
      {corpo}
    </section>
  );
}
