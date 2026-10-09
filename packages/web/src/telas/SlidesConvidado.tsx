import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  NOMES_MODOS,
  ROTAS,
  type Aplicativo,
  type EstadoDispositivo,
  type ModoConvidado,
  type RespostaLinkConvidado,
  type RespostaLinkFixo,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPost } from '../nucleo/cliente';
import { copiarTexto } from '../nucleo/copiar';
import '../estilos/convidado.css';

/** O que dá para entregar ao convidado nesta máquina. Offline, oferece o que ela tem configurado. */
function modosDa(maquina: EstadoDispositivo | undefined): ModoConvidado[] {
  if (!maquina) return [];
  const modos: ModoConvidado[] = [];
  // Programa que a equipe desmarcou nesta máquina (Ajustes) não é oferecido.
  const usa = (app: Aplicativo) => !maquina.apps || maquina.apps.includes(app);
  if (maquina.holyrics && usa('holyrics')) modos.push('holyrics');
  if ((maquina.powerpoint || maquina.agente?.capacidades.includes('powerpoint')) && usa('powerpoint')) {
    modos.push('powerpoint');
  }
  if (maquina.agente) modos.push('teclado');
  return modos;
}

const DICA_DO_MODO: Record<ModoConvidado, string> = {
  holyrics: 'Avança e volta os slides do Holyrics, esteja ele na frente ou não.',
  powerpoint: 'Avança e volta a apresentação do PowerPoint que estiver em exibição.',
  teclado: 'Manda as setas para o programa que estiver na frente da máquina.',
};

const DICA_COMPLETO: Record<ModoConvidado, string> = {
  holyrics: 'Além de Anterior e Próximo: lista de reprodução, Plano de fundo, Sem letra, Tela preta e Sair.',
  powerpoint: 'Além de Anterior e Próximo: Iniciar e Encerrar a apresentação, com a prévia do slide atual e do próximo.',
  teclado: '',
};

/** Máquina que o link controla: cada link tem a sua, então a escolha mora no próprio formulário. */
function CampoMaquina({
  maquinas,
  valor,
  aoMudar,
}: {
  maquinas: EstadoDispositivo[];
  valor: string;
  aoMudar: (id: string) => void;
}) {
  return (
    <label className="campo">
      <span className="campo__rotulo">Máquina a controlar</span>
      <select className="versoes__select" value={valor} onChange={(evento) => aoMudar(evento.target.value)}>
        {maquinas.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Escolha do que o link controla (modo) e se o controle é completo. */
function OpcoesDoLink({
  modos,
  modo,
  completo,
  aoMudarModo,
  aoMudarCompleto,
}: {
  modos: ModoConvidado[];
  modo: ModoConvidado | null;
  completo: boolean;
  aoMudarModo: (modo: ModoConvidado) => void;
  aoMudarCompleto: (completo: boolean) => void;
}) {
  return (
    <>
      <div className="campo">
        <span className="campo__rotulo">O que a pessoa vai controlar</span>
        <div className="seletor-dias seletor-dias--livre">
          {modos.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={modo === opcao}
              className={`seletor-dias__dia${modo === opcao ? ' seletor-dias__dia--marcado' : ''}`}
              onClick={() => aoMudarModo(opcao)}
            >
              {NOMES_MODOS[opcao]}
            </button>
          ))}
        </div>
        {modo ? <p className="versoes__dica">{DICA_DO_MODO[modo]}</p> : null}
      </div>

      {modo && modo !== 'teclado' ? (
        <div className="convite-opcao">
          <span>
            Controle completo
            <span className="versoes__dica"> — {DICA_COMPLETO[modo]}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={completo}
            aria-label="Controle completo"
            className={`interruptor${completo ? ' interruptor--ligado' : ''}`}
            onClick={() => aoMudarCompleto(!completo)}
          >
            <span className="interruptor__bolinha" />
          </button>
        </div>
      ) : null}
    </>
  );
}

function descricaoDoLink(link: RespostaLinkFixo): string {
  const partes = [link.dispositivoNome, NOMES_MODOS[link.modo]];
  if (link.modo !== 'teclado') partes.push(link.completo ? 'controle completo' : 'só avançar e voltar');
  return partes.join(' · ');
}

type Pendente = { id: string; tipo: 'pin' | 'excluir' } | null;

function LinksFixos({
  controlaveis,
  notificar,
}: {
  controlaveis: EstadoDispositivo[];
  notificar: (mensagem: string, tipo?: 'info' | 'alerta') => void;
}) {
  const [links, setLinks] = useState<RespostaLinkFixo[] | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [pendente, setPendente] = useState<Pendente>(null);
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [dispositivo, setDispositivo] = useState('');
  const [modoEscolhido, setModoEscolhido] = useState<ModoConvidado | null>(null);
  const [completo, setCompleto] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const escolhida = controlaveis.some((m) => m.id === dispositivo) ? dispositivo : (controlaveis[0]?.id ?? '');
  const maquina = controlaveis.find((m) => m.id === escolhida);
  const modos = modosDa(maquina);
  const modo = modoEscolhido && modos.includes(modoEscolhido) ? modoEscolhido : (modos[0] ?? null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await apiGet<{ links: RespostaLinkFixo[] }>(ROTAS.convidadoFixos);
      setLinks(resposta.links);
    } catch {
      // erro já virou toast
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function criar(): Promise<void> {
    if (!maquina || !modo || !nome.trim() || ocupado) return;
    setOcupado(true);
    try {
      await apiPost(ROTAS.convidadoFixos, {
        nome: nome.trim(),
        dispositivo: maquina.id,
        modo,
        completo: modo !== 'teclado' && completo,
      });
      setNome('');
      setCompleto(false);
      setCriando(false);
      await carregar();
    } catch {
      // erro já virou toast
    } finally {
      setOcupado(false);
    }
  }

  async function copiar(link: RespostaLinkFixo): Promise<void> {
    const copiou = await copiarTexto(link.url);
    notificar(copiou ? 'Link copiado.' : 'Não consegui copiar o link.', copiou ? 'info' : 'alerta');
  }

  async function alternarQr(link: RespostaLinkFixo): Promise<void> {
    if (qrs[link.id]) {
      setQrs(({ [link.id]: _fechado, ...resto }) => resto);
      return;
    }
    const imagem = await QRCode.toDataURL(link.url, { width: 320, margin: 1 });
    setQrs((atual) => ({ ...atual, [link.id]: imagem }));
  }

  async function confirmar(link: RespostaLinkFixo, tipo: 'pin' | 'excluir'): Promise<void> {
    if (pendente?.id !== link.id || pendente.tipo !== tipo) {
      setPendente({ id: link.id, tipo });
      return;
    }
    setPendente(null);
    setOcupado(true);
    try {
      if (tipo === 'pin') {
        await apiPost(ROTAS.convidadoFixosPin, { id: link.id });
        notificar('PIN trocado. Os celulares conectados a este link foram desconectados.');
      } else {
        await apiPost(ROTAS.convidadoFixosExcluir, { id: link.id });
        setQrs(({ [link.id]: _excluido, ...resto }) => resto);
      }
      await carregar();
    } catch {
      // erro já virou toast
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="slides-convidado__secao">
      <h2 className="versoes__titulo">Links fixos</h2>
      <p className="versoes__dica">
        Não expiram e cada um tem o próprio PIN. O celular digita o PIN uma vez e fica conectado até o PIN mudar.
      </p>

      {links === null ? null : links.length === 0 ? (
        <p className="info">Nenhum link fixo ainda.</p>
      ) : (
        <div className="links-fixos">
          {links.map((link) => {
            const confirmandoPin = pendente?.id === link.id && pendente.tipo === 'pin';
            const confirmandoExcluir = pendente?.id === link.id && pendente.tipo === 'excluir';
            return (
              <div key={link.id} className="info link-fixo">
                <span className="link-fixo__nome">{link.nome}</span>
                <span className="link-fixo__detalhe">{descricaoDoLink(link)}</span>
                <span>
                  PIN: <strong className="link-fixo__pin">{link.pin}</strong>
                </span>
                <div className="link-fixo__acoes">
                  <button type="button" className="controle-apps__acao" onClick={() => void copiar(link)}>
                    Copiar link
                  </button>
                  <button type="button" className="controle-apps__acao" onClick={() => void alternarQr(link)}>
                    {qrs[link.id] ? 'Esconder QR' : 'Mostrar QR'}
                  </button>
                  <button
                    type="button"
                    className="controle-apps__acao"
                    disabled={ocupado}
                    onClick={() => void confirmar(link, 'pin')}
                  >
                    {confirmandoPin ? 'Confirmar: derruba os celulares' : 'Trocar PIN'}
                  </button>
                  <button
                    type="button"
                    className="controle-apps__acao link-fixo__perigo"
                    disabled={ocupado}
                    onClick={() => void confirmar(link, 'excluir')}
                  >
                    {confirmandoExcluir ? 'Confirmar exclusão' : 'Excluir'}
                  </button>
                  {confirmandoPin || confirmandoExcluir ? (
                    <button type="button" className="controle-apps__acao" onClick={() => setPendente(null)}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
                {qrs[link.id] ? (
                  <img className="link-fixo__qr" src={qrs[link.id]} alt={`QR code do link ${link.nome}`} />
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {criando ? (
        <div className="links-fixos">
          <label className="campo">
            <span className="campo__rotulo">Nome do link</span>
            <input
              className="convite__campo"
              type="text"
              maxLength={60}
              placeholder="Ex.: Louvor — Note Frente"
              value={nome}
              onChange={(evento) => setNome(evento.target.value)}
            />
          </label>
          <CampoMaquina maquinas={controlaveis} valor={escolhida} aoMudar={setDispositivo} />
          <OpcoesDoLink
            modos={modos}
            modo={modo}
            completo={completo}
            aoMudarModo={setModoEscolhido}
            aoMudarCompleto={setCompleto}
          />
          <button
            type="button"
            className="botao-acao"
            disabled={ocupado || !nome.trim() || !modo || !maquina}
            onClick={() => void criar()}
          >
            Criar link fixo
          </button>
          <button type="button" className="controle-apps__acao" onClick={() => setCriando(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" className="controle-apps__acao" onClick={() => setCriando(true)}>
          Novo link fixo
        </button>
      )}
    </section>
  );
}

/**
 * Links para quem vai apresentar. A pessoa escaneia, digita o PIN e passa os
 * slides da máquina escolhida — sem PIN da equipe e sem acesso ao resto do
 * painel. Há links fixos (PIN próprio, não expiram) e o temporário do dia.
 */
export function SlidesConvidado() {
  const { snapshot, notificar } = useAppContexto();
  const maquinas = useMemo(() => snapshot?.dispositivos ?? [], [snapshot]);
  const [dispositivo, setDispositivo] = useState('');
  const [link, setLink] = useState<RespostaLinkConvidado | null>(null);
  const [imagemQr, setImagemQr] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pinNovo, setPinNovo] = useState('');
  const [salvandoPin, setSalvandoPin] = useState(false);

  const [modoEscolhido, setModoEscolhido] = useState<ModoConvidado | null>(null);
  const [completo, setCompleto] = useState(false);

  const controlaveis = maquinas.filter((m) => modosDa(m).length > 0);
  const escolhida = controlaveis.some((m) => m.id === dispositivo) ? dispositivo : (controlaveis[0]?.id ?? '');
  const maquina = controlaveis.find((m) => m.id === escolhida);
  const modos = modosDa(maquina);
  const modo = modoEscolhido && modos.includes(modoEscolhido) ? modoEscolhido : (modos[0] ?? null);

  /** Escolha mudou com o QR na tela: o link é o mesmo, então some até gerar de novo com a escolha nova. */
  function esquecerLink(): void {
    setLink(null);
    setImagemQr('');
  }

  async function gerar(regerar: boolean): Promise<void> {
    if (!escolhida || !modo || gerando) return;
    setGerando(true);
    try {
      const resposta = await apiPost<RespostaLinkConvidado>(ROTAS.convidadoLink, {
        dispositivo: escolhida,
        regerar,
        modo,
        completo: modo !== 'teclado' && completo,
      });
      setLink(resposta);
      setImagemQr(await QRCode.toDataURL(resposta.url, { width: 320, margin: 1 }));
    } catch {
      // erro já virou toast
    } finally {
      setGerando(false);
    }
  }

  async function trocarPin(): Promise<void> {
    if (pinNovo.length !== 4 || salvandoPin) return;
    setSalvandoPin(true);
    try {
      await apiPost(ROTAS.ajustes, { pinConvidado: pinNovo });
      setLink((atual) => (atual ? { ...atual, pin: pinNovo } : atual));
      setPinNovo('');
    } catch {
      // erro já virou toast
    } finally {
      setSalvandoPin(false);
    }
  }

  if (controlaveis.length === 0) return null;

  return (
    <div className="versoes__alvo">
      <LinksFixos controlaveis={controlaveis} notificar={notificar} />

      <section className="slides-convidado__secao">
        <h2 className="versoes__titulo">Link temporário de hoje</h2>
        <p className="versoes__dica">Para visitante avulso: vale um dia e usa o PIN de convidado abaixo.</p>

        <CampoMaquina
          maquinas={controlaveis}
          valor={escolhida}
          aoMudar={(id) => {
            setDispositivo(id);
            esquecerLink();
          }}
        />

        <OpcoesDoLink
          modos={modos}
          modo={modo}
          completo={completo}
          aoMudarModo={(m) => {
            setModoEscolhido(m);
            esquecerLink();
          }}
          aoMudarCompleto={(c) => {
            setCompleto(c);
            esquecerLink();
          }}
        />

        {link && imagemQr ? (
          <div className="convite">
            <img className="convite__qr" src={imagemQr} alt={`QR code para ${link.nome}`} />
            <p className="convite__pin">
              PIN do convidado: <strong>{link.pin}</strong>
            </p>
            <p className="versoes__dica">
              A pessoa escaneia, digita esse PIN uma vez e{' '}
              {link.completo ? 'tem o controle completo' : 'só vê Avançar e Voltar'}
              {link.modo ? ` (${NOMES_MODOS[link.modo]})` : ''}. O acesso dura um dia.
            </p>

            <p className="convite__link">{link.url}</p>
            <div className="convite__troca">
              <button
                type="button"
                className="controle-apps__acao"
                onClick={() =>
                  void copiarTexto(link.url).then((copiou) =>
                    notificar(
                      copiou ? 'Link copiado.' : 'Não consegui copiar; selecione o link acima.',
                      copiou ? 'info' : 'alerta',
                    ),
                  )
                }
              >
                Copiar link
              </button>
              <a className="controle-apps__acao convite__abrir" href={link.url} target="_blank" rel="noreferrer">
                Abrir link
              </a>
            </div>

            <div className="convite__troca">
              <input
                className="convite__campo"
                type="tel"
                inputMode="numeric"
                placeholder="Novo PIN"
                value={pinNovo}
                maxLength={4}
                onChange={(evento) => setPinNovo(evento.target.value.replace(/\D/g, '').slice(0, 4))}
              />
              <button
                type="button"
                className="controle-apps__acao"
                disabled={pinNovo.length !== 4 || salvandoPin}
                onClick={() => void trocarPin()}
              >
                Trocar PIN
              </button>
            </div>

            <button type="button" className="controle-apps__acao" onClick={() => void gerar(true)}>
              Trocar o link (derruba os anteriores)
            </button>
          </div>
        ) : (
          <button type="button" className="botao-acao" disabled={gerando || !modo} onClick={() => void gerar(false)}>
            {gerando ? 'Gerando…' : 'Mostrar QR code'}
          </button>
        )}
      </section>
    </div>
  );
}
