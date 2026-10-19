import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ACOES_APP,
  APLICATIVOS,
  ESPERA_ABRIR_PADRAO_S,
  ESPERA_MAX_MS,
  NOMES_APLICATIVOS,
  NOMES_POSICOES_RELOGIO,
  POSICOES_RELOGIO,
  ROTAS,
  resumirFalhas,
  type AcaoApp,
  type AcaoCenario,
  type Aplicativo,
  type Cenario,
  type CenarioParaSalvar,
  type EstadoDispositivo,
  type ResultadoCenario,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { OpcoesAviso } from '../componentes/OpcoesAviso';
import { apiDelete, apiGet, apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { Icone } from '../componentes/Icone';
import { ICONES_CENARIO, IconeCenario, nomeDoIconeCenario } from '../componentes/IconeCenario';

type TipoPasso = AcaoCenario['tipo'];

const NOMES_PASSOS: Record<TipoPasso, string> = {
  'ndi.definirFonte': 'Trocar a fonte de um datashow (NDI)',
  'obs.definirCena': 'Trocar a cena do OBS',
  'holyrics.f8': 'Plano de fundo do Holyrics (F8)',
  'holyrics.encerrarApresentacao': 'Fechar a apresentação do Holyrics',
  'holyrics.relogio': 'Relógio do Holyrics',
  'app.acao': 'Abrir ou fechar um programa',
  'aviso.mostrar': 'Mostrar um aviso na tela',
  espera: 'Esperar um pouco',
};

const NOMES_ACOES_APP: Record<AcaoApp, string> = {
  abrir: 'Abrir (se estiver fechado)',
  fechar: 'Fechar',
  reiniciar: 'Reiniciar',
  frente: 'Trazer para frente',
};

const ESPERAS_MS = [300, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000];
const OUTRA_ESPERA = 'outro';

function rotuloEspera(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms >= 60_000 && ms % 60_000 === 0) return `${ms / 60_000} min`;
  return `${(ms / 1000).toLocaleString('pt-BR')} s`;
}

function comNdi(dispositivos: EstadoDispositivo[]) {
  return dispositivos.filter((d) => d.ndi.length > 0);
}
function comObs(dispositivos: EstadoDispositivo[]) {
  return dispositivos.filter((d) => d.obs !== undefined);
}
function comHolyrics(dispositivos: EstadoDispositivo[]) {
  return dispositivos.filter((d) => d.holyrics !== undefined);
}
function comAgente(dispositivos: EstadoDispositivo[]) {
  return dispositivos.filter((d) => d.agente !== undefined);
}
/** Programas instalados na máquina; agente antigo não informa, então vão todos. */
function appsDa(dispositivo: EstadoDispositivo | undefined): Aplicativo[] {
  return [...(dispositivo?.agente?.appsInstalados ?? APLICATIVOS)];
}

/** Passo novo já preenchido com a primeira opção que faz sentido. */
function passoPadrao(tipo: TipoPasso, dispositivos: EstadoDispositivo[]): AcaoCenario {
  switch (tipo) {
    case 'ndi.definirFonte': {
      const primeiro = comNdi(dispositivos)[0];
      return { tipo, dispositivo: primeiro?.id ?? '', porta: primeiro?.ndi[0]?.porta ?? 80, fonte: null };
    }
    case 'obs.definirCena': {
      const primeiro = comObs(dispositivos)[0];
      return { tipo, dispositivo: primeiro?.id ?? '', cena: primeiro?.obs?.cenas[0] ?? '' };
    }
    case 'holyrics.f8':
      return { tipo, dispositivo: comHolyrics(dispositivos)[0]?.id ?? '', ativar: true };
    case 'holyrics.encerrarApresentacao':
      return { tipo, dispositivo: comHolyrics(dispositivos)[0]?.id ?? '' };
    case 'app.acao': {
      const primeiro = comAgente(dispositivos)[0];
      const apps = appsDa(primeiro);
      return { tipo, dispositivo: primeiro?.id ?? '', app: apps.includes('holyrics') ? 'holyrics' : (apps[0] ?? 'holyrics'), acao: 'abrir' };
    }
    case 'aviso.mostrar':
      return { tipo, dispositivos: [], mensagem: '', noPainel: true, monitores: {}, segundos: null };
    case 'holyrics.relogio':
      return { tipo, dispositivo: comHolyrics(dispositivos)[0]?.id ?? '', mostrar: true, posicao: 'top_left' };
    case 'espera':
      return { tipo, ms: 500 };
  }
}

/** Interruptor com rótulo, no mesmo visual dos Ajustes. */
function Opcao({ rotulo, ligado, aoMudar }: { rotulo: string; ligado: boolean; aoMudar: (ligado: boolean) => void }) {
  return (
    <div className="passo-editor__opcao">
      <span>{rotulo}</span>
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
    </div>
  );
}

/** Lista de atalhos + "Outro…", que abre um campo em segundos. */
function CampoEspera({ ms, aoMudar }: { ms: number; aoMudar: (ms: number) => void }) {
  const [outro, setOutro] = useState(!ESPERAS_MS.includes(ms));
  const [texto, setTexto] = useState(String(ms / 1000).replace('.', ','));
  return (
    <>
      <label className="campo">
        <span className="campo__rotulo">Quanto tempo</span>
        <select
          className="versoes__select"
          value={outro ? OUTRA_ESPERA : String(ms)}
          onChange={(e) => {
            if (e.target.value === OUTRA_ESPERA) {
              setOutro(true);
              setTexto(String(ms / 1000).replace('.', ','));
              return;
            }
            setOutro(false);
            aoMudar(Number(e.target.value));
          }}
        >
          {ESPERAS_MS.map((opcao) => (
            <option key={opcao} value={opcao}>
              {rotuloEspera(opcao)}
            </option>
          ))}
          <option value={OUTRA_ESPERA}>Outro…</option>
        </select>
      </label>
      {outro ? (
        <label className="campo">
          <span className="campo__rotulo">Segundos (até {ESPERA_MAX_MS / 60_000} min)</span>
          <input
            className="campo__entrada"
            inputMode="decimal"
            value={texto}
            placeholder="Ex.: 15"
            onChange={(e) => {
              setTexto(e.target.value);
              const segundos = Number(e.target.value.replace(',', '.'));
              if (Number.isFinite(segundos) && segundos > 0) {
                aoMudar(Math.min(ESPERA_MAX_MS, Math.max(100, Math.round(segundos * 1000))));
              }
            }}
          />
        </label>
      ) : null}
    </>
  );
}

/** Mantém o valor salvo na lista mesmo se ele sumiu (máquina offline, fonte fora da rede). */
function comAtual(opcoes: string[], atual: string | null | undefined): string[] {
  return atual && !opcoes.includes(atual) ? [atual, ...opcoes] : opcoes;
}

function EditorPasso({
  passo,
  indice,
  total,
  dispositivos,
  aoMudar,
  aoMover,
  aoRemover,
}: {
  passo: AcaoCenario;
  indice: number;
  total: number;
  dispositivos: EstadoDispositivo[];
  aoMudar: (passo: AcaoCenario) => void;
  aoMover: (direcao: -1 | 1) => void;
  aoRemover: () => void;
}) {
  const nomeDe = (id: string) => dispositivos.find((d) => d.id === id)?.nome ?? `${id} (não encontrada)`;

  function seletorMaquina(lista: EstadoDispositivo[], valor: string, aoEscolher: (id: string) => void) {
    const ids = comAtual(
      lista.map((d) => d.id),
      valor,
    );
    return (
      <label className="campo">
        <span className="campo__rotulo">Máquina</span>
        <select className="versoes__select" value={valor} onChange={(e) => aoEscolher(e.target.value)}>
          {ids.length === 0 ? <option value="">Nenhuma máquina com isso</option> : null}
          {ids.map((id) => (
            <option key={id} value={id}>
              {nomeDe(id)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  let campos: ReactNode = null;
  if (passo.tipo === 'ndi.definirFonte') {
    const maquina = dispositivos.find((d) => d.id === passo.dispositivo);
    const janelas = comAtual(
      (maquina?.ndi ?? []).map((j) => String(j.porta)),
      String(passo.porta),
    );
    const janela = maquina?.ndi.find((j) => j.porta === passo.porta);
    const fontes = comAtual(janela?.fontesDisponiveis ?? [], passo.fonte);
    campos = (
      <>
        {seletorMaquina(comNdi(dispositivos), passo.dispositivo, (id) => {
          const nova = dispositivos.find((d) => d.id === id);
          aoMudar({ ...passo, dispositivo: id, porta: nova?.ndi[0]?.porta ?? 80, fonte: null });
        })}
        <label className="campo">
          <span className="campo__rotulo">Janela do Studio Monitor</span>
          <select
            className="versoes__select"
            value={String(passo.porta)}
            onChange={(e) => aoMudar({ ...passo, porta: Number(e.target.value), fonte: null })}
          >
            {janelas.map((porta) => (
              <option key={porta} value={porta}>
                Janela {porta}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span className="campo__rotulo">Mostrar</span>
          <select
            className="versoes__select"
            value={passo.fonte ?? ''}
            onChange={(e) => aoMudar({ ...passo, fonte: e.target.value || null })}
          >
            <option value="">Nada (tela sem imagem)</option>
            {fontes.map((fonte) => (
              <option key={fonte} value={fonte}>
                {fonte}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  } else if (passo.tipo === 'obs.definirCena') {
    const maquina = dispositivos.find((d) => d.id === passo.dispositivo);
    const cenas = comAtual(maquina?.obs?.cenas ?? [], passo.cena);
    campos = (
      <>
        {seletorMaquina(comObs(dispositivos), passo.dispositivo, (id) => {
          const nova = dispositivos.find((d) => d.id === id);
          aoMudar({ ...passo, dispositivo: id, cena: nova?.obs?.cenas[0] ?? '' });
        })}
        <label className="campo">
          <span className="campo__rotulo">Cena</span>
          <select className="versoes__select" value={passo.cena} onChange={(e) => aoMudar({ ...passo, cena: e.target.value })}>
            {cenas.length === 0 ? <option value="">O OBS não informou as cenas</option> : null}
            {cenas.map((cena) => (
              <option key={cena} value={cena}>
                {cena}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  } else if (passo.tipo === 'holyrics.f8') {
    campos = (
      <>
        {seletorMaquina(comHolyrics(dispositivos), passo.dispositivo, (id) => aoMudar({ ...passo, dispositivo: id }))}
        <label className="campo">
          <span className="campo__rotulo">Plano de fundo</span>
          <select
            className="versoes__select"
            value={passo.ativar ? 'ligar' : 'desligar'}
            onChange={(e) => aoMudar({ ...passo, ativar: e.target.value === 'ligar' })}
          >
            <option value="ligar">Ligar</option>
            <option value="desligar">Desligar</option>
          </select>
        </label>
      </>
    );
  } else if (passo.tipo === 'holyrics.encerrarApresentacao') {
    campos = seletorMaquina(comHolyrics(dispositivos), passo.dispositivo, (id) =>
      aoMudar({ ...passo, dispositivo: id }),
    );
  } else if (passo.tipo === 'app.acao') {
    const maquina = dispositivos.find((d) => d.id === passo.dispositivo);
    const apps = appsDa(maquina);
    if (!apps.includes(passo.app)) apps.unshift(passo.app);
    campos = (
      <>
        {seletorMaquina(comAgente(dispositivos), passo.dispositivo, (id) => {
          const disponiveis = appsDa(dispositivos.find((d) => d.id === id));
          aoMudar({ ...passo, dispositivo: id, app: disponiveis.includes(passo.app) ? passo.app : (disponiveis[0] ?? passo.app) });
        })}
        <label className="campo">
          <span className="campo__rotulo">Programa</span>
          <select
            className="versoes__select"
            value={passo.app}
            onChange={(e) => aoMudar({ ...passo, app: e.target.value as typeof passo.app })}
          >
            {apps.map((app) => (
              <option key={app} value={app}>
                {NOMES_APLICATIVOS[app]}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span className="campo__rotulo">O que fazer</span>
          <select
            className="versoes__select"
            value={passo.acao}
            onChange={(e) => aoMudar({ ...passo, acao: e.target.value as AcaoApp })}
          >
            {ACOES_APP.map((acao) => (
              <option key={acao} value={acao}>
                {NOMES_ACOES_APP[acao]}
              </option>
            ))}
          </select>
        </label>
        {passo.acao === 'abrir' || passo.acao === 'reiniciar' ? (
          <>
            <Opcao
              rotulo="Esperar abrir antes do próximo passo"
              ligado={passo.esperarPronto === true}
              aoMudar={(ligado) =>
                aoMudar({ ...passo, esperarPronto: ligado, esperaMaxSegundos: passo.esperaMaxSegundos ?? ESPERA_ABRIR_PADRAO_S })
              }
            />
            {passo.esperarPronto ? (
              <>
                <label className="campo">
                  <span className="campo__rotulo">Esperar no máximo (segundos)</span>
                  <input
                    className="campo__entrada"
                    type="number"
                    min={5}
                    max={600}
                    value={passo.esperaMaxSegundos ?? ESPERA_ABRIR_PADRAO_S}
                    onChange={(e) => {
                      const valor = Math.round(Number(e.target.value));
                      aoMudar({ ...passo, esperaMaxSegundos: Number.isFinite(valor) ? Math.min(600, Math.max(5, valor)) : ESPERA_ABRIR_PADRAO_S });
                    }}
                  />
                </label>
                <p className="versoes__dica">
                  {passo.app === 'holyrics' && maquina?.holyrics !== undefined
                    ? 'Segue quando o Holyrics responde pela API.'
                    : 'Segue quando a janela do programa aparece.'}{' '}
                  Se não abrir nesse tempo, os passos seguintes não rodam.
                </p>
              </>
            ) : (
              <p className="versoes__dica">Desligado, só manda abrir e passa para o próximo passo na hora.</p>
            )}
          </>
        ) : null}
      </>
    );
  } else if (passo.tipo === 'aviso.mostrar') {
    // As escolhidas continuam na lista mesmo com a máquina fora do ar.
    const maquinas = comAgente(dispositivos).map((d) => d.id);
    for (const id of passo.dispositivos) if (!maquinas.includes(id)) maquinas.push(id);
    const alternar = (id: string) =>
      aoMudar({
        ...passo,
        dispositivos: passo.dispositivos.includes(id)
          ? passo.dispositivos.filter((d) => d !== id)
          : [...passo.dispositivos, id],
      });
    campos = (
      <>
        <label className="campo">
          <span className="campo__rotulo">Mensagem</span>
          <textarea
            className="campo__entrada campo__entrada--texto"
            rows={2}
            maxLength={300}
            value={passo.mensagem}
            placeholder="Ex.: Faltam 10 minutos, hora de iniciar a transmissão"
            onChange={(e) => aoMudar({ ...passo, mensagem: e.target.value })}
          />
        </label>
        <div className="campo">
          <span className="campo__rotulo">Onde aparece</span>
          <div className="seletor-dias seletor-dias--livre">
            {maquinas.map((id) => {
              const marcado = passo.dispositivos.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={marcado}
                  className={`seletor-dias__dia${marcado ? ' seletor-dias__dia--marcado' : ''}`}
                  onClick={() => alternar(id)}
                >
                  {nomeDe(id)}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={passo.noPainel}
              className={`seletor-dias__dia${passo.noPainel ? ' seletor-dias__dia--marcado' : ''}`}
              onClick={() => aoMudar({ ...passo, noPainel: !passo.noPainel })}
            >
              Painel (celulares)
            </button>
          </div>
        </div>
        <OpcoesAviso
          comPadrao
          maquinas={passo.dispositivos
            .map((id) => dispositivos.find((d) => d.id === id))
            .filter((d): d is EstadoDispositivo => d !== undefined)}
          monitores={passo.monitores}
          aoEscolherMonitor={(id, monitor) => {
            const { [id]: _anterior, ...resto } = passo.monitores;
            aoMudar({ ...passo, monitores: monitor === undefined ? resto : { ...resto, [id]: monitor } });
          }}
          segundos={passo.segundos}
          aoEscolherSegundos={(segundos) => aoMudar({ ...passo, segundos })}
        />
        <p className="versoes__dica">
          Nas máquinas abre uma janela por cima de tudo. Sem escolher a tela, vale o padrão da máquina (Sistema ›
          Ajustes). Cuidado com a tela do telão e com a que vai para a live.
        </p>
      </>
    );
  } else if (passo.tipo === 'holyrics.relogio') {
    campos = (
      <>
        {seletorMaquina(comHolyrics(dispositivos), passo.dispositivo, (id) => aoMudar({ ...passo, dispositivo: id }))}
        <label className="campo">
          <span className="campo__rotulo">Relógio</span>
          <select
            className="versoes__select"
            value={passo.mostrar === null ? '' : passo.mostrar ? 'mostrar' : 'esconder'}
            onChange={(e) => aoMudar({ ...passo, mostrar: e.target.value === '' ? null : e.target.value === 'mostrar' })}
          >
            <option value="">Deixar como está</option>
            <option value="mostrar">Mostrar</option>
            <option value="esconder">Esconder</option>
          </select>
        </label>
        <label className="campo">
          <span className="campo__rotulo">Posição</span>
          <select
            className="versoes__select"
            value={passo.posicao ?? ''}
            onChange={(e) => aoMudar({ ...passo, posicao: (e.target.value || null) as typeof passo.posicao })}
          >
            <option value="">Deixar como está</option>
            {POSICOES_RELOGIO.map((posicao) => (
              <option key={posicao} value={posicao}>
                {NOMES_POSICOES_RELOGIO[posicao]}
              </option>
            ))}
          </select>
        </label>
      </>
    );
  } else {
    campos = <CampoEspera key={indice} ms={passo.ms} aoMudar={(ms) => aoMudar({ ...passo, ms })} />;
  }

  return (
    <li className="passo-editor">
      <div className="passo-editor__topo">
        <span className="passo-editor__numero">{indice + 1}</span>
        <select
          className="versoes__select passo-editor__tipo"
          value={passo.tipo}
          onChange={(e) => aoMudar(passoPadrao(e.target.value as TipoPasso, dispositivos))}
        >
          {(Object.keys(NOMES_PASSOS) as TipoPasso[]).map((tipo) => (
            <option key={tipo} value={tipo}>
              {NOMES_PASSOS[tipo]}
            </option>
          ))}
        </select>
        <div className="passo-editor__acoes">
          <button type="button" className="botao-icone" disabled={indice === 0} onClick={() => aoMover(-1)} aria-label="Subir passo">
            <Icone nome="subir" tamanho={18} />
          </button>
          <button
            type="button"
            className="botao-icone"
            disabled={indice === total - 1}
            onClick={() => aoMover(1)}
            aria-label="Descer passo"
          >
            <Icone nome="descer" tamanho={18} />
          </button>
          <button type="button" className="botao-icone botao-icone--perigo" onClick={aoRemover} aria-label="Remover passo">
            <Icone nome="lixo" tamanho={18} />
          </button>
        </div>
      </div>
      <div className="passo-editor__campos">{campos}</div>
    </li>
  );
}

/** O que falta para salvar, em português; null quando está tudo certo. */
function problemaNoRascunho(rascunho: CenarioParaSalvar): string | null {
  if (!rascunho.nome.trim()) return 'Dê um nome ao cenário.';
  if (rascunho.acoes.length === 0) return 'Adicione pelo menos um passo.';
  for (const [indice, passo] of rascunho.acoes.entries()) {
    if (passo.tipo === 'aviso.mostrar') {
      if (!passo.mensagem.trim()) return `Escreva a mensagem do aviso no passo ${indice + 1}.`;
      if (passo.dispositivos.length === 0 && !passo.noPainel) return `Escolha onde o aviso do passo ${indice + 1} aparece.`;
      continue;
    }
    if (passo.tipo !== 'espera' && !passo.dispositivo) return `Escolha a máquina do passo ${indice + 1}.`;
    if (passo.tipo === 'obs.definirCena' && !passo.cena) return `Escolha a cena do passo ${indice + 1}.`;
    if (passo.tipo === 'holyrics.relogio' && passo.mostrar === null && passo.posicao === null) {
      return `Escolha o que muda no relógio do passo ${indice + 1}.`;
    }
  }
  return null;
}

export function Cenarios() {
  const { snapshot, notificar } = useAppContexto();
  const dispositivos = snapshot?.dispositivos ?? [];
  const [cenarios, setCenarios] = useState<Cenario[] | null>(null);
  const [rascunho, setRascunho] = useState<CenarioParaSalvar | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await apiGet<{ cenarios: Cenario[] }>(ROTAS.cenarios);
      setCenarios(resposta.cenarios);
    } catch {
      // erro já virou toast
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function rodar(cenario: Cenario): Promise<void> {
    vibrar(15);
    setOcupado(cenario.id);
    try {
      const resultado = await apiPost<ResultadoCenario>(ROTAS.executarCenario, { cenarioId: cenario.id });
      if (resultado.ok) {
        notificar(`"${cenario.nome}" aplicado.`, 'info');
      } else {
        notificar(`"${cenario.nome}" teve falhas — ${resumirFalhas(resultado.acoes)}`, 'alerta');
      }
    } catch {
      // erro já virou toast
    } finally {
      setOcupado(null);
    }
  }

  async function salvar(): Promise<void> {
    if (!rascunho) return;
    const problema = problemaNoRascunho(rascunho);
    if (problema) {
      notificar(problema, 'alerta');
      return;
    }
    setOcupado('salvando');
    try {
      await apiPost<Cenario>(ROTAS.cenarios, { ...rascunho, nome: rascunho.nome.trim() });
      notificar('Cenário salvo.', 'info');
      setRascunho(null);
      await carregar();
    } catch {
      // erro já virou toast
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(): Promise<void> {
    if (!rascunho?.id) return;
    if (!window.confirm(`Excluir "${rascunho.nome}"? Os agendamentos dele também saem.`)) return;
    try {
      await apiDelete(ROTAS.cenario.replace(':id', encodeURIComponent(rascunho.id)));
      setRascunho(null);
      await carregar();
    } catch {
      // erro já virou toast
    }
  }

  function mudarPasso(indice: number, passo: AcaoCenario): void {
    setRascunho((atual) => (atual ? { ...atual, acoes: atual.acoes.map((p, i) => (i === indice ? passo : p)) } : atual));
  }

  function moverPasso(indice: number, direcao: -1 | 1): void {
    setRascunho((atual) => {
      if (!atual) return atual;
      const acoes = [...atual.acoes];
      const destino = indice + direcao;
      const [movido] = acoes.splice(indice, 1);
      if (!movido) return atual;
      acoes.splice(destino, 0, movido);
      return { ...atual, acoes };
    });
  }

  if (rascunho) {
    return (
      <div className="cenarios">
        <section className="versoes__alvo cenario-editor">
          <h2 className="versoes__titulo">{rascunho.id ? 'Editar cenário' : 'Novo cenário'}</h2>
          <label className="campo">
            <span className="campo__rotulo">Nome</span>
            <input
              className="campo__entrada"
              value={rascunho.nome}
              placeholder="Ex.: Louvor"
              onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
            />
          </label>
          <label className="campo">
            <span className="campo__rotulo">Descrição (opcional)</span>
            <input
              className="campo__entrada"
              value={rascunho.descricao ?? ''}
              placeholder="O que ele deixa pronto"
              onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value || undefined })}
            />
          </label>
          <div className="campo">
            <span className="campo__rotulo">Ícone</span>
            <div className="seletor-icone">
              {ICONES_CENARIO.map((nome) => (
                <button
                  key={nome}
                  type="button"
                  className={`seletor-icone__opcao${(rascunho.icone ?? 'play') === nome ? ' seletor-icone__opcao--ativa' : ''}`}
                  aria-label={nome}
                  aria-pressed={(rascunho.icone ?? 'play') === nome}
                  onClick={() => setRascunho({ ...rascunho, icone: nome })}
                >
                  <Icone nome={nome} tamanho={22} />
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="versoes__alvo cenario-editor">
          <h2 className="versoes__titulo">Passos, na ordem</h2>
          {rascunho.acoes.length === 0 ? <p className="versoes__dica">Nenhum passo ainda.</p> : null}
          <ol className="passos-editor">
            {rascunho.acoes.map((passo, indice) => (
              <EditorPasso
                key={indice}
                passo={passo}
                indice={indice}
                total={rascunho.acoes.length}
                dispositivos={dispositivos}
                aoMudar={(novo) => mudarPasso(indice, novo)}
                aoMover={(direcao) => moverPasso(indice, direcao)}
                aoRemover={() =>
                  setRascunho({ ...rascunho, acoes: rascunho.acoes.filter((_, i) => i !== indice) })
                }
              />
            ))}
          </ol>
          <button
            type="button"
            className="botao-secundario"
            onClick={() =>
              setRascunho({ ...rascunho, acoes: [...rascunho.acoes, passoPadrao('ndi.definirFonte', dispositivos)] })
            }
          >
            <Icone nome="mais" tamanho={18} /> Adicionar passo
          </button>
          <p className="versoes__dica">
            Se um passo falhar, os outros continuam — e o painel avisa qual falhou. A exceção é o "Abrir" com "esperar
            abrir": se o programa não abrir, o resto para.
          </p>
        </section>

        <div className="cenario-editor__rodape">
          <button type="button" className="botao-acao" disabled={ocupado === 'salvando'} onClick={() => void salvar()}>
            {ocupado === 'salvando' ? 'Salvando…' : 'Salvar cenário'}
          </button>
          <button type="button" className="botao-secundario" onClick={() => setRascunho(null)}>
            Cancelar
          </button>
          {rascunho.id ? (
            <button type="button" className="botao-secundario botao-secundario--perigo" onClick={() => void excluir()}>
              <Icone nome="lixo" tamanho={18} /> Excluir cenário
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!cenarios) return <p className="painel__vazio">Carregando cenários…</p>;

  return (
    <div className="cenarios">
      <p className="versoes__dica">
        Um cenário deixa várias coisas prontas de uma vez, com um toque — ou sozinho, pelos agendamentos.
      </p>

      {cenarios.length === 0 ? <p className="painel__vazio">Nenhum cenário ainda.</p> : null}

      <ul className="lista-cenarios">
        {cenarios.map((cenario) => (
          <li key={cenario.id} className="cartao-cenario">
            <span className="cartao-cenario__icone">
              <IconeCenario icone={cenario.icone} />
            </span>
            <div className="cartao-cenario__texto">
              <p className="cartao-cenario__nome">{cenario.nome}</p>
              <p className="cartao-cenario__descricao">
                {cenario.descricao ?? `${cenario.acoes.length} passo${cenario.acoes.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <div className="cartao-cenario__acoes">
              <button
                type="button"
                className="botao-icone"
                aria-label={`Editar ${cenario.nome}`}
                onClick={() => setRascunho({ ...cenario, icone: nomeDoIconeCenario(cenario.icone) ?? cenario.icone })}
              >
                <Icone nome="editar" tamanho={18} />
              </button>
              <button
                type="button"
                className="botao-rodar"
                disabled={ocupado === cenario.id}
                onClick={() => void rodar(cenario)}
              >
                {ocupado === cenario.id ? 'Aplicando…' : 'Rodar'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="botao-acao"
        onClick={() => setRascunho({ nome: '', icone: 'play', acoes: [passoPadrao('ndi.definirFonte', dispositivos)] })}
      >
        <Icone nome="mais" tamanho={20} /> Novo cenário
      </button>
    </div>
  );
}
