import { useEffect, useState } from 'react';
import type { AcaoCheck, ImagemCheck, PassoCheck, ResultadoCheck, StatusPasso } from '@maestro/shared';
import { ROTAS } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { Icone, type NomeIcone } from '../componentes/Icone';
import '../estilos/ndi.css';

type TipoCheck = 'legendas' | 'ndi';

const ICONES: Record<StatusPasso, NomeIcone> = {
  ok: 'ok',
  falha: 'falha',
  aviso: 'aviso',
  pulado: 'pulado',
};

const ROTULOS_BOTAO: Record<TipoCheck, string> = {
  legendas: 'Testar legendas',
  ndi: 'Testar NDI',
};

const CONFIRMAR_FORCAR =
  'Isso vai exibir uma música e um versículo no telão e pode ir para a transmissão. Continuar?';

/** Passos sem grupo primeiro; depois um bloco por grupo (a máquina), na ordem em que apareceram. */
function agrupar(passos: PassoCheck[]): Array<{ grupo: string | null; passos: PassoCheck[] }> {
  const blocos: Array<{ grupo: string | null; passos: PassoCheck[] }> = [];
  for (const passo of passos) {
    const grupo = passo.grupo ?? null;
    const bloco = blocos.find((b) => b.grupo === grupo);
    if (bloco) bloco.passos.push(passo);
    else blocos.push({ grupo, passos: [passo] });
  }
  return blocos.sort((a, b) => (a.grupo === null ? -1 : b.grupo === null ? 1 : 0));
}

/** Prints que um passo guardou (origem | destino), com ampliação ao tocar. */
function ImagensDoPasso({ imagens, aoAmpliar }: { imagens: ImagemCheck[]; aoAmpliar: (imagem: ImagemCheck) => void }) {
  return (
    <div className={`passo-check__imagens${imagens.length === 1 ? ' passo-check__imagens--unica' : ''}`}>
      {imagens.map((imagem) => (
        <figure key={imagem.rotulo} className="print-ndi">
          <button
            type="button"
            className="print-ndi__botao"
            aria-label={`Ampliar: ${imagem.rotulo}`}
            onClick={() => aoAmpliar(imagem)}
          >
            <img className="print-ndi__imagem" src={imagem.dataUrl} alt={imagem.rotulo} />
          </button>
          <figcaption className="print-ndi__rotulo">{imagem.rotulo}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function Testes() {
  const { resultadosCheck, snapshot, notificar } = useAppContexto();
  const [rodando, setRodando] = useState<TipoCheck | null>(null);
  const [resultado, setResultado] = useState<ResultadoCheck | null>(null);
  const [ultimoForcado, setUltimoForcado] = useState(false);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<ImagemCheck | null>(null);

  // Enquanto um check roda, o hub vai empurrando o resultado parcial pelo
  // WebSocket (mensagens tipo "check") — usamos o mais recente como progresso
  // ao vivo, e o corpo da resposta do POST como veredito final.
  useEffect(() => {
    if (!rodando) return;
    const valores = Object.values(resultadosCheck);
    if (valores.length === 0) return;
    const maisRecente = valores.reduce((a, b) => (b.ts > a.ts ? b : a));
    setResultado(maisRecente);
  }, [resultadosCheck, rodando]);

  async function rodar(tipo: TipoCheck, forcar = false): Promise<void> {
    if (rodando) return;
    vibrar(15);
    setRodando(tipo);
    setResultado(null);
    if (tipo === 'legendas') setUltimoForcado(forcar);
    try {
      const final =
        tipo === 'legendas'
          ? await apiPost<ResultadoCheck>(ROTAS.checkLegendas, forcar ? { forcar: true } : {})
          : await apiPost<ResultadoCheck>(ROTAS.checkNdi);
      setResultado(final);
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setRodando(null);
    }
  }

  function forcar(): void {
    if (!window.confirm(CONFIRMAR_FORCAR)) return;
    void rodar('legendas', true);
  }

  /** Atualizar a fonte com algo no ar apaga a legenda por um instante: pergunta antes. */
  async function corrigir(acao: AcaoCheck): Promise<void> {
    const holyrics = snapshot?.dispositivos.find((d) => d.id === acao.holyrics)?.holyrics;
    if (
      holyrics?.apresentacao &&
      !window.confirm(
        `O Holyrics está exibindo "${holyrics.apresentacao.nome}". Atualizar a fonte "${acao.fonte}" apaga a legenda por um instante. Continuar?`,
      )
    ) {
      return;
    }
    setCorrigindo(acao.fonte);
    try {
      await apiPost(ROTAS.legendasAtualizarFonte, { dispositivo: acao.dispositivo, fonte: acao.fonte });
      notificar(`Fonte "${acao.fonte}" atualizada no OBS. Testando de novo…`, 'info');
    } catch {
      setCorrigindo(null);
      return; // erro já virou toast
    }
    setCorrigindo(null);
    // Dá um respiro para a página da fonte carregar antes de testar de novo.
    await new Promise((r) => setTimeout(r, 1500));
    await rodar('legendas', ultimoForcado);
  }

  return (
    <div className="testes">
      <div className="testes__botoes">
        <button
          type="button"
          className="botao-acao"
          disabled={rodando !== null}
          onClick={() => void rodar('legendas')}
        >
          {rodando === 'legendas' ? 'Testando legendas…' : ROTULOS_BOTAO.legendas}
        </button>
        <button type="button" className="botao-acao" disabled={rodando !== null} onClick={() => void rodar('ndi')}>
          {rodando === 'ndi' ? 'Testando NDI…' : ROTULOS_BOTAO.ndi}
        </button>
      </div>
      <p className="versoes__dica">
        O teste de legendas exibe a primeira música da lista e um versículo em cada Holyrics, por alguns
        segundos. Rode antes do culto, com o OBS fora do ar.
      </p>

      {rodando && !resultado ? <p className="testes__progresso">Rodando testes…</p> : null}

      {resultado ? (
        <section className={`resultado-check resultado-check--${resultado.status}`}>
          <header className="resultado-check__cabecalho">
            <h2>{resultado.titulo}</h2>
            <p>{resultado.resumo}</p>
          </header>
          {resultado.bloqueio?.podeForcar && !rodando ? (
            <button type="button" className="botao-secundario botao-secundario--perigo" onClick={forcar}>
              Forçar teste
            </button>
          ) : null}
          {agrupar(resultado.passos).map((bloco) => (
            <div key={bloco.grupo ?? '-'}>
              {bloco.grupo ? <h3 className="versoes__titulo">{bloco.grupo}</h3> : null}
              <ol className="resultado-check__passos">
                {bloco.passos.map((passo) => (
                  <li key={passo.id} className={`passo-check passo-check--${passo.status}`}>
                    <span className="passo-check__icone">
                      <Icone nome={ICONES[passo.status]} tamanho={20} />
                    </span>
                    <div className="passo-check__corpo">
                      <p className="passo-check__titulo">{passo.titulo}</p>
                      <p className="passo-check__detalhe">{passo.detalhe}</p>
                      {passo.comoResolver ? (
                        <p className="passo-check__resolver">Como resolver: {passo.comoResolver}</p>
                      ) : null}
                      {passo.imagens && passo.imagens.length > 0 ? (
                        <ImagensDoPasso imagens={passo.imagens} aoAmpliar={setAmpliada} />
                      ) : null}
                      {passo.acao ? (
                        <button
                          type="button"
                          className="botao-secundario"
                          disabled={rodando !== null || corrigindo !== null}
                          onClick={() => passo.acao && void corrigir(passo.acao)}
                        >
                          {corrigindo === passo.acao.fonte ? 'Atualizando…' : passo.acao.rotulo}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      ) : null}

      {ampliada ? (
        <button type="button" className="ampliacao-ndi" aria-label="Fechar imagem ampliada" onClick={() => setAmpliada(null)}>
          <img className="ampliacao-ndi__imagem" src={ampliada.dataUrl} alt={ampliada.rotulo} />
          <span className="ampliacao-ndi__legenda">{ampliada.rotulo}</span>
        </button>
      ) : null}
    </div>
  );
}
