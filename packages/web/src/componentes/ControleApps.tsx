import { useEffect, useState } from 'react';
import {
  APLICATIVOS,
  NOMES_APLICATIVOS,
  ROTAS,
  type AcaoApp,
  type Aplicativo,
  type EstadoDispositivo,
} from '@maestro/shared';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

const ROTULOS: Record<AcaoApp, string> = {
  abrir: 'Abrir',
  frente: 'Trazer para frente',
  fechar: 'Fechar',
  reiniciar: 'Reiniciar',
};

/** Cabe na pílula do cartão; o nome completo aparece ao gerenciar. */
const NOMES_CURTOS: Record<Aplicativo, string> = {
  obs: 'OBS',
  holyrics: 'Holyrics',
  powerpoint: 'PowerPoint',
  'ndi-studio-monitor': 'Studio Monitor',
  'ndi-screen-capture': 'Screen Capture',
};

/**
 * O agente responde ao pedido antes de o programa terminar de abrir ou fechar, e
 * o painel só fica sabendo no próximo ciclo de leitura. Até lá o botão fica
 * carregando e o programa não aceita outra ação. Passado o tempo, solta de
 * qualquer jeito: um Holyrics que não abriu não pode travar o botão para sempre.
 */
const ESPERA_MAXIMA_MS: Record<AcaoApp, number> = {
  abrir: 25_000,
  fechar: 15_000,
  reiniciar: 20_000,
  frente: 2_500,
};

/** Menos que isto o "reiniciar" não dá tempo de fechar e abrir de novo. */
const ESPERA_MINIMA_REINICIAR_MS = 4_000;

interface Pendente {
  acao: AcaoApp;
  desde: number;
  /** Para o reiniciar: o programa já foi visto fechado, falta voltar a abrir. */
  viuFechado: boolean;
}

function terminou(pendente: Pendente, aberto: boolean, agora: number): boolean {
  const decorrido = agora - pendente.desde;
  if (decorrido >= ESPERA_MAXIMA_MS[pendente.acao]) return true;
  switch (pendente.acao) {
    case 'abrir':
      return aberto;
    case 'fechar':
      return !aberto;
    case 'reiniciar':
      return pendente.viuFechado && aberto && decorrido >= ESPERA_MINIMA_REINICIAR_MS;
    case 'frente':
      return false;
  }
}

/** Fechado, só faz sentido abrir; aberto, o resto. */
function acoesPara(aberto: boolean): AcaoApp[] {
  return aberto ? ['frente', 'reiniciar', 'fechar'] : ['abrir'];
}

export function ControleApps({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const [expandido, setExpandido] = useState(false);
  const [pendentes, setPendentes] = useState<Partial<Record<Aplicativo, Pendente>>>({});
  const [agora, setAgora] = useState(() => Date.now());

  const agente = dispositivo.agente;
  const processos = agente?.processos;
  const temPendente = Object.keys(pendentes).length > 0;

  // Enquanto algum programa espera confirmação, olha o relógio de perto.
  useEffect(() => {
    if (!temPendente) return undefined;
    const timer = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [temPendente]);

  // Cada leitura nova do painel ou passo do relógio confere se já deu.
  useEffect(() => {
    if (!temPendente || !processos) return;
    setPendentes((atuais) => {
      let mudou = false;
      const novos: Partial<Record<Aplicativo, Pendente>> = {};
      for (const app of APLICATIVOS) {
        const pendente = atuais[app];
        if (!pendente) continue;
        const aberto = processos[app] === true;
        const atualizado = !pendente.viuFechado && !aberto ? { ...pendente, viuFechado: true } : pendente;
        if (terminou(atualizado, aberto, agora)) {
          mudou = true;
          continue;
        }
        if (atualizado !== pendente) mudou = true;
        novos[app] = atualizado;
      }
      return mudou ? novos : atuais;
    });
  }, [processos, agora, temPendente]);

  if (!agente?.online) return null;

  // Programa não instalado não aparece. Aberto aparece mesmo sem caminho
  // conhecido, para dar para fechar ou trazer para frente. Agente antigo (sem a
  // lista) mostra todos, como antes.
  const instalados = agente.appsInstalados;
  const visiveis = APLICATIVOS.filter(
    (app) => !instalados || instalados.includes(app) || agente.processos[app] === true,
  );
  if (visiveis.length === 0) return null;

  async function acionar(app: Aplicativo, acao: AcaoApp): Promise<void> {
    if (pendentes[app]) return;
    vibrar(15);
    const desde = Date.now();
    setAgora(desde);
    setPendentes((atuais) => ({ ...atuais, [app]: { acao, desde, viuFechado: false } }));
    try {
      await apiPost(ROTAS.appAcao, { dispositivo: dispositivo.id, app, acao });
    } catch {
      // erro já virou toast pelo cliente de API: não há o que esperar
      setPendentes((atuais) => {
        const resto = { ...atuais };
        delete resto[app];
        return resto;
      });
    }
  }

  return (
    <div className="controle-apps">
      <div className="controle-apps__resumo">
        <div className="controle-apps__cabecalho">
          <span className="controle-apps__titulo">Programas</span>
          <button
            type="button"
            className="controle-apps__alternar"
            aria-expanded={expandido}
            onClick={() => setExpandido((atual) => !atual)}
          >
            {expandido ? 'Fechar' : 'Gerenciar'}
          </button>
        </div>
        <ul className="pilulas" aria-label="Programas desta máquina">
          {visiveis.map((app) => {
            const aberto = agente.processos[app] === true;
            return (
              <li key={app} className={`pilula${aberto ? ' pilula--aberta' : ''}`}>
                <span className="pilula__ponto" aria-hidden="true" />
                {NOMES_CURTOS[app]}
                <span className="visualmente-oculto">{aberto ? ' (aberto)' : ' (fechado)'}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {expandido ? (
        <ul className="controle-apps__lista">
          {visiveis.map((app) => {
            const aberto = agente.processos[app] === true;
            const pendente = pendentes[app];
            return (
              <li key={app} className="controle-apps__item">
                <span className="controle-apps__nome">
                  <span
                    className={`controle-apps__ponto${aberto ? ' controle-apps__ponto--aberto' : ''}`}
                    aria-hidden="true"
                  />
                  {NOMES_APLICATIVOS[app]}
                </span>
                <span className="controle-apps__botoes">
                  {acoesPara(aberto).map((acao) => (
                    <button
                      key={acao}
                      type="button"
                      className={`controle-apps__acao${pendente?.acao === acao ? ' controle-apps__acao--carregando' : ''}`}
                      disabled={pendente !== undefined}
                      aria-busy={pendente?.acao === acao}
                      onClick={() => void acionar(app, acao)}
                    >
                      {pendente?.acao === acao ? (
                        <span className="controle-apps__espera" aria-hidden="true" />
                      ) : null}
                      {ROTULOS[acao]}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
