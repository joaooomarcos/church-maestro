import { useState } from 'react';
import QRCode from 'qrcode';
import {
  APLICATIVOS,
  NOMES_APLICATIVOS,
  NOMES_MODOS,
  ROTAS,
  type Aplicativo,
  type EstadoDispositivo,
  type ModoConvidado,
  type RespostaLinkConvidado,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { copiarTexto } from '../nucleo/copiar';

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
  teclado: 'Manda as setas do teclado para o programa escolhido: serve para PDF, navegador e o que mais passar com seta.',
};

/**
 * QR code para quem vai apresentar. A pessoa escaneia, digita o PIN de
 * convidado e passa os slides da máquina escolhida — sem PIN da equipe e sem
 * acesso ao resto do painel.
 */
export function SlidesConvidado() {
  const { snapshot, notificar } = useAppContexto();
  const maquinas = snapshot?.dispositivos ?? [];
  const [dispositivo, setDispositivo] = useState('');
  const [link, setLink] = useState<RespostaLinkConvidado | null>(null);
  const [imagemQr, setImagemQr] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pinNovo, setPinNovo] = useState('');
  const [salvandoPin, setSalvandoPin] = useState(false);

  const [modoEscolhido, setModoEscolhido] = useState<ModoConvidado | null>(null);
  const [appEscolhido, setAppEscolhido] = useState<Aplicativo | null>(null);

  const controlaveis = maquinas.filter((m) => modosDa(m).length > 0);
  const escolhida = dispositivo || controlaveis[0]?.id || '';
  const maquina = controlaveis.find((m) => m.id === escolhida);
  const modos = modosDa(maquina);
  const modo = modoEscolhido && modos.includes(modoEscolhido) ? modoEscolhido : (modos[0] ?? null);
  // Para as setas: os programas que a máquina usa; de saída o PowerPoint, que é o caso mais comum.
  const appsDaMaquina = maquina?.apps?.length ? maquina.apps : [...APLICATIVOS];
  const appPadrao = appsDaMaquina.includes('powerpoint') ? 'powerpoint' : (appsDaMaquina[0] ?? 'powerpoint');
  const app = appEscolhido && appsDaMaquina.includes(appEscolhido) ? appEscolhido : appPadrao;

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
        ...(modo === 'teclado' ? { app } : {}),
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
    if (pinNovo.length < 4 || salvandoPin) return;
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
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Controle para quem vai apresentar</h2>
      <select
        className="versoes__select"
        value={escolhida}
        onChange={(evento) => {
          setDispositivo(evento.target.value);
          esquecerLink();
        }}
      >
        {controlaveis.map((maquina) => (
          <option key={maquina.id} value={maquina.id}>
            {maquina.nome}
          </option>
        ))}
      </select>

      <div className="campo">
        <span className="campo__rotulo">O que a pessoa vai controlar</span>
        <div className="seletor-dias seletor-dias--livre">
          {modos.map((opcao) => (
            <button
              key={opcao}
              type="button"
              aria-pressed={modo === opcao}
              className={`seletor-dias__dia${modo === opcao ? ' seletor-dias__dia--marcado' : ''}`}
              onClick={() => {
                setModoEscolhido(opcao);
                esquecerLink();
              }}
            >
              {NOMES_MODOS[opcao]}
            </button>
          ))}
        </div>
        {modo ? <p className="versoes__dica">{DICA_DO_MODO[modo]}</p> : null}
      </div>

      {modo === 'teclado' ? (
        <label className="campo">
          <span className="campo__rotulo">Programa que recebe as setas</span>
          <select
            className="versoes__select"
            value={app}
            onChange={(evento) => {
              setAppEscolhido(evento.target.value as Aplicativo);
              esquecerLink();
            }}
          >
            {appsDaMaquina.map((opcao) => (
              <option key={opcao} value={opcao}>
                {NOMES_APLICATIVOS[opcao]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {link && imagemQr ? (
        <div className="convite">
          <img className="convite__qr" src={imagemQr} alt={`QR code para ${link.nome}`} />
          <p className="convite__pin">
            PIN do convidado: <strong>{link.pin}</strong>
          </p>
          <p className="versoes__dica">
            A pessoa escaneia, digita esse PIN uma vez e só vê Avançar e Voltar
            {link.modo ? ` (${NOMES_MODOS[link.modo]}${link.app ? `: ${NOMES_APLICATIVOS[link.app]}` : ''})` : ''}. O
            acesso dura um dia.
          </p>

          <p className="convite__link">{link.url}</p>
          <div className="convite__troca">
            <button
              type="button"
              className="controle-apps__acao"
              onClick={() =>
                void copiarTexto(link.url).then((copiou) =>
                  notificar(copiou ? 'Link copiado.' : 'Não consegui copiar; selecione o link acima.', copiou ? 'info' : 'alerta'),
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
              onChange={(evento) => setPinNovo(evento.target.value.trim())}
            />
            <button
              type="button"
              className="controle-apps__acao"
              disabled={pinNovo.length < 4 || salvandoPin}
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
        <button
          type="button"
          className="botao-acao"
          disabled={gerando || !modo}
          onClick={() => void gerar(false)}
        >
          {gerando ? 'Gerando…' : 'Mostrar QR code'}
        </button>
      )}
    </section>
  );
}
