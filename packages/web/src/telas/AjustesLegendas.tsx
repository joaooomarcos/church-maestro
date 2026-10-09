import { useEffect, useState } from 'react';
import {
  DIAS_SEMANA,
  ROTAS,
  type ConfigLegendas,
  type EstruturaObs,
  type FaixaHorario,
  type ItemEstruturaObs,
  type RespostaLegendas,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPut } from '../nucleo/cliente';
import { Icone } from '../componentes/Icone';

/**
 * Ajustes › Legendas: como as legendas estão montadas no OBS (cena, grupo da
 * música, grupo da leitura e a fonte de cada Holyrics), mais a atualização
 * automática das fontes e os horários em que o teste não roda.
 *
 * Os campos aceitam texto livre, mas sugerem o que o OBS tem — e o botão
 * "Sugerir pelo OBS" preenche tudo pelos nomes.
 */

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const PADRAO_MUSICA = /musica|louvor|letra/;
const PADRAO_LEITURA = /leitura|biblia|versic|texto/;

function ehFonteWeb(item: ItemEstruturaObs): boolean {
  return !item.grupo && (item.tipo === null || item.tipo === 'browser_source');
}

/**
 * Escolhe, entre as fontes do grupo, a deste Holyrics: pelo número da posição
 * ("holyrics1", "holyrics2"…), por um pedaço do nome da máquina ("frente",
 * "fundo") ou, em último caso, pela ordem.
 */
function sugerirFonte(itens: ItemEstruturaObs[], posicao: number, nomeMaquina: string): string | undefined {
  const fontes = itens.filter(ehFonteWeb);
  const pedacos = normalizar(nomeMaquina)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4);
  return (
    fontes.find((f) => pedacos.some((p) => normalizar(f.nome).includes(p))) ??
    fontes.find((f) => new RegExp(`(^|\\D)${posicao + 1}(\\D|$)`).test(f.nome)) ??
    fontes[posicao]
  )?.nome;
}

function sugerir(
  estrutura: EstruturaObs,
  holyrics: RespostaLegendas['holyrics'],
  atual: ConfigLegendas,
): ConfigLegendas {
  const nomesGrupos = new Set(estrutura.grupos.map((g) => g.nome));
  const cenas = estrutura.cenas.filter((c) => c.itens.filter((i) => i.grupo || nomesGrupos.has(i.nome)).length >= 2);
  const cena = cenas.find((c) => /elemento|legenda/.test(normalizar(c.nome))) ?? cenas[0];
  const gruposDaCena = cena
    ? estrutura.grupos.filter((g) => cena.itens.some((i) => i.nome === g.nome))
    : estrutura.grupos;
  const grupoMusica = gruposDaCena.find((g) => PADRAO_MUSICA.test(normalizar(g.nome)));
  const grupoLeitura = gruposDaCena.find((g) => PADRAO_LEITURA.test(normalizar(g.nome)));

  return {
    ...atual,
    cena: cena?.nome ?? atual.cena,
    grupoMusica: grupoMusica?.nome ?? atual.grupoMusica,
    grupoLeitura: grupoLeitura?.nome ?? atual.grupoLeitura,
    holyrics: holyrics.map((h, posicao) => {
      const anterior = atual.holyrics.find((x) => x.dispositivo === h.id);
      const fonteMusica = grupoMusica ? sugerirFonte(grupoMusica.itens, posicao, h.nome) : undefined;
      const fonteLeitura = grupoLeitura ? sugerirFonte(grupoLeitura.itens, posicao, h.nome) : undefined;
      return {
        dispositivo: h.id,
        ...((fonteMusica ?? anterior?.fonteMusica) ? { fonteMusica: fonteMusica ?? anterior?.fonteMusica } : {}),
        ...((fonteLeitura ?? anterior?.fonteLeitura) ? { fonteLeitura: fonteLeitura ?? anterior?.fonteLeitura } : {}),
      };
    }),
  };
}

function CampoComSugestoes({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  id,
}: {
  rotulo: string;
  valor: string | undefined;
  opcoes: string[];
  aoMudar: (valor: string | undefined) => void;
  id: string;
}) {
  return (
    <label className="campo">
      <span className="campo__rotulo">{rotulo}</span>
      <input
        className="campo__entrada"
        list={`${id}-opcoes`}
        value={valor ?? ''}
        placeholder={opcoes[0] ?? 'Nome exato, como no OBS'}
        onChange={(e) => aoMudar(e.target.value.trim() ? e.target.value : undefined)}
      />
      <datalist id={`${id}-opcoes`}>
        {opcoes.map((opcao) => (
          <option key={opcao} value={opcao} />
        ))}
      </datalist>
    </label>
  );
}

function Interruptor({ ligado, rotulo, aoMudar }: { ligado: boolean; rotulo: string; aoMudar: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      className={`interruptor${ligado ? ' interruptor--ligado' : ''}`}
      onClick={() => aoMudar(!ligado)}
    >
      <span className="interruptor__bolinha" />
    </button>
  );
}

function EditorFaixa({
  faixa,
  aoMudar,
  aoRemover,
}: {
  faixa: FaixaHorario;
  aoMudar: (faixa: FaixaHorario) => void;
  aoRemover: () => void;
}) {
  return (
    <li className="monitor-avisos">
      <div className="monitor-avisos__linha">
        <div className="seletor-dias seletor-dias--livre">
          {DIAS_SEMANA.map((rotulo, dia) => {
            const marcado = faixa.dias.includes(dia);
            return (
              <button
                key={rotulo}
                type="button"
                aria-pressed={marcado}
                className={`seletor-dias__dia${marcado ? ' seletor-dias__dia--marcado' : ''}`}
                onClick={() =>
                  aoMudar({ ...faixa, dias: marcado ? faixa.dias.filter((d) => d !== dia) : [...faixa.dias, dia] })
                }
              >
                {rotulo}
              </button>
            );
          })}
        </div>
        <button type="button" className="botao-icone botao-icone--perigo" aria-label="Remover horário" onClick={aoRemover}>
          <Icone nome="lixo" tamanho={18} />
        </button>
      </div>
      <div className="monitor-avisos__linha">
        <label className="campo">
          <span className="campo__rotulo">Das</span>
          <input
            className="campo__entrada"
            type="time"
            value={faixa.inicio}
            onChange={(e) => aoMudar({ ...faixa, inicio: e.target.value })}
          />
        </label>
        <label className="campo">
          <span className="campo__rotulo">Até</span>
          <input
            className="campo__entrada"
            type="time"
            value={faixa.fim}
            onChange={(e) => aoMudar({ ...faixa, fim: e.target.value })}
          />
        </label>
      </div>
    </li>
  );
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Seção "Legendas" de Ajustes. Não recebe props: carrega e grava sozinha. */
export function AjustesLegendas() {
  const { notificar } = useAppContexto();
  const [dados, setDados] = useState<RespostaLegendas | null>(null);
  const [obsId, setObsId] = useState<string | null>(null);
  const [config, setConfig] = useState<ConfigLegendas | null>(null);
  const [estrutura, setEstrutura] = useState<EstruturaObs | null>(null);
  const [lendoObs, setLendoObs] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [alterado, setAlterado] = useState(false);

  useEffect(() => {
    apiGet<RespostaLegendas>(ROTAS.legendas)
      .then((resposta) => {
        setDados(resposta);
        setObsId(resposta.obs);
        setConfig(resposta.config);
      })
      .catch(() => {
        // erro já virou toast
      });
  }, []);

  /**
   * `automatico`: a leitura feita ao abrir a tela não vira aviso de erro — com
   * o OBS desligado (o normal fora do culto) a pessoa só digita os nomes.
   */
  async function lerObs(sugerirDepois: boolean, automatico = false): Promise<void> {
    if (!obsId || !dados || !config) return;
    setLendoObs(true);
    try {
      const caminho = `${ROTAS.legendasEstruturaObs}?dispositivo=${encodeURIComponent(obsId)}`;
      let lida: EstruturaObs;
      if (automatico) {
        const resposta = await fetch(caminho, { credentials: 'include' });
        if (!resposta.ok) throw new Error('OBS fora do ar');
        lida = (await resposta.json()) as EstruturaObs;
      } else {
        lida = await apiGet<EstruturaObs>(caminho);
      }
      setEstrutura(lida);
      if (sugerirDepois) {
        setConfig(sugerir(lida, dados.holyrics, config));
        setAlterado(true);
      }
    } catch {
      setEstrutura(null); // OBS fora do ar: dá para digitar os nomes
    } finally {
      setLendoObs(false);
    }
  }

  // Lê o OBS uma vez ao abrir; sem nada configurado ainda, já sugere.
  useEffect(() => {
    if (!dados || !config || estrutura || lendoObs) return;
    void lerObs(!config.cena && !dados.legado, true);
  }, [dados, obsId]); // só ao abrir ou trocar de máquina; o resto é pelo botão

  if (!dados || !config) return null;

  if (dados.maquinasObs.length === 0) {
    return (
      <section className="versoes__alvo">
        <h2 className="versoes__titulo">Legendas</h2>
        <p className="versoes__dica">Nenhuma máquina tem o OBS configurado. Rode o assistente de instalação no PC do OBS.</p>
      </section>
    );
  }

  function mudar(parcial: Partial<ConfigLegendas>): void {
    setConfig((atual) => (atual ? { ...atual, ...parcial } : atual));
    setAlterado(true);
  }

  function mudarFonte(dispositivo: string, campo: 'fonteMusica' | 'fonteLeitura', valor: string | undefined): void {
    if (!config) return;
    const existentes = config.holyrics.some((h) => h.dispositivo === dispositivo)
      ? config.holyrics
      : [...config.holyrics, { dispositivo }];
    mudar({
      holyrics: existentes.map((h) => {
        if (h.dispositivo !== dispositivo) return h;
        const { [campo]: _anterior, ...resto } = h;
        return valor ? { ...resto, [campo]: valor } : resto;
      }),
    });
  }

  async function salvar(): Promise<void> {
    if (!obsId || !config) return;
    const faixaRuim = config.horariosProibidos.find((f) => f.dias.length === 0 || !HORA.test(f.inicio) || !HORA.test(f.fim));
    if (faixaRuim) {
      notificar('Cada horário proibido precisa de pelo menos um dia e das duas horas.', 'erro');
      return;
    }
    setSalvando(true);
    try {
      const resposta = await apiPut<RespostaLegendas>(ROTAS.legendas, { dispositivo: obsId, config });
      setDados(resposta);
      setConfig(resposta.config);
      setAlterado(false);
      notificar('Legendas salvas.', 'info');
    } catch {
      // erro já virou toast
    } finally {
      setSalvando(false);
    }
  }

  const cenaAtual = estrutura?.cenas.find((c) => c.nome === config.cena);
  const nomesGrupos = (estrutura?.grupos ?? [])
    .filter((g) => !cenaAtual || cenaAtual.itens.some((i) => i.nome === g.nome))
    .map((g) => g.nome);
  const fontesDoGrupo = (grupo: string | undefined): string[] => {
    const itens = estrutura?.grupos.find((g) => g.nome === grupo)?.itens;
    return (itens ?? estrutura?.grupos.flatMap((g) => g.itens) ?? []).filter(ehFonteWeb).map((i) => i.nome);
  };

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Legendas</h2>
      <p className="versoes__dica">
        Como a legenda está montada no OBS: a cena com os dois grupos (o gatilho do Holyrics abre e fecha o grupo
        inteiro) e, dentro de cada grupo, a fonte web de cada Holyrics. O teste de legendas usa isto.
      </p>
      {dados.legado ? (
        <p className="versoes__dica versoes__dica--alerta">
          Configuração antiga (uma fonte só). Complete os campos e salve para testar música e leitura dos dois
          Holyrics.
        </p>
      ) : null}

      {dados.maquinasObs.length > 1 ? (
        <label className="campo">
          <span className="campo__rotulo">Máquina do OBS</span>
          <select
            className="versoes__select"
            value={obsId ?? ''}
            onChange={(e) => {
              setObsId(e.target.value);
              setEstrutura(null);
              setAlterado(true);
            }}
          >
            {dados.maquinasObs.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="monitor-avisos__linha">
        <p className="versoes__dica">
          {estrutura
            ? 'Os campos sugerem o que existe no OBS.'
            : lendoObs
              ? 'Lendo o OBS…'
              : 'OBS fora do ar: digite os nomes exatos, ou ligue o OBS e toque em "Sugerir pelo OBS".'}
        </p>
        <button type="button" className="botao-secundario" disabled={lendoObs} onClick={() => void lerObs(true)}>
          Sugerir pelo OBS
        </button>
      </div>

      <CampoComSugestoes
        id="legendas-cena"
        rotulo="Cena"
        valor={config.cena}
        opcoes={(estrutura?.cenas ?? []).map((c) => c.nome)}
        aoMudar={(cena) => mudar({ cena })}
      />
      <CampoComSugestoes
        id="legendas-grupo-musica"
        rotulo="Grupo da música"
        valor={config.grupoMusica}
        opcoes={nomesGrupos}
        aoMudar={(grupoMusica) => mudar({ grupoMusica })}
      />
      <CampoComSugestoes
        id="legendas-grupo-leitura"
        rotulo="Grupo da leitura (bíblia)"
        valor={config.grupoLeitura}
        opcoes={nomesGrupos}
        aoMudar={(grupoLeitura) => mudar({ grupoLeitura })}
      />

      {dados.holyrics.length === 0 ? (
        <p className="versoes__dica">
          Nenhuma máquina está marcada com o Holyrics em "Programas de cada máquina".
        </p>
      ) : (
        <ul className="monitores-avisos">
          {dados.holyrics.map((h) => {
            const fontes = config.holyrics.find((x) => x.dispositivo === h.id);
            return (
              <li key={h.id} className="monitor-avisos">
                <p className="monitor-avisos__nome">Holyrics do {h.nome}</p>
                <CampoComSugestoes
                  id={`legendas-${h.id}-musica`}
                  rotulo="Fonte da música"
                  valor={fontes?.fonteMusica}
                  opcoes={fontesDoGrupo(config.grupoMusica)}
                  aoMudar={(v) => mudarFonte(h.id, 'fonteMusica', v)}
                />
                <CampoComSugestoes
                  id={`legendas-${h.id}-leitura`}
                  rotulo="Fonte da leitura"
                  valor={fontes?.fonteLeitura}
                  opcoes={fontesDoGrupo(config.grupoLeitura)}
                  aoMudar={(v) => mudarFonte(h.id, 'fonteLeitura', v)}
                />
              </li>
            );
          })}
        </ul>
      )}

      <label className="campo">
        <span className="campo__rotulo">Versículo do teste</span>
        <input
          className="campo__entrada"
          value={config.versiculo}
          onChange={(e) => mudar({ versiculo: e.target.value })}
          placeholder="Sl 23:1"
        />
      </label>

      <div className="monitor-avisos__linha">
        <p className="monitor-avisos__nome">Atualizar as fontes automaticamente quando o Holyrics ligar</p>
        <Interruptor
          ligado={config.atualizarAoLigar}
          rotulo="Atualizar as fontes automaticamente quando o Holyrics ligar"
          aoMudar={(atualizarAoLigar) => mudar({ atualizarAoLigar })}
        />
      </div>
      <p className="versoes__dica">
        Se o Holyrics abre depois do OBS, a legenda fica vazia até alguém clicar em "Atualizar" na fonte. Ligado, o
        Maestro faz isso sozinho quando o Holyrics liga sem nada no ar.
      </p>

      <h3 className="versoes__titulo">Horários proibidos</h3>
      <p className="versoes__dica">
        O teste de legendas exibe uma música e um versículo. Nestes horários ele não roda (só com "Forçar teste").
      </p>
      {config.horariosProibidos.length > 0 ? (
        <ul className="monitores-avisos">
          {config.horariosProibidos.map((faixa, indice) => (
            <EditorFaixa
              key={indice}
              faixa={faixa}
              aoMudar={(nova) =>
                mudar({ horariosProibidos: config.horariosProibidos.map((f, i) => (i === indice ? nova : f)) })
              }
              aoRemover={() => mudar({ horariosProibidos: config.horariosProibidos.filter((_, i) => i !== indice) })}
            />
          ))}
        </ul>
      ) : null}
      <button
        type="button"
        className="botao-secundario"
        onClick={() =>
          mudar({ horariosProibidos: [...config.horariosProibidos, { dias: [0], inicio: '18:00', fim: '21:00' }] })
        }
      >
        Adicionar horário
      </button>

      <button
        type="button"
        className="botao-acao"
        disabled={salvando || !alterado || !obsId}
        onClick={() => void salvar()}
      >
        {salvando ? 'Salvando…' : alterado ? 'Salvar legendas' : 'Salvo'}
      </button>
    </section>
  );
}
