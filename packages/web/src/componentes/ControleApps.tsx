import { useState } from 'react';
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

/** Fechado, só faz sentido abrir; aberto, o resto. */
function acoesPara(aberto: boolean): AcaoApp[] {
  return aberto ? ['frente', 'reiniciar', 'fechar'] : ['abrir'];
}

export function ControleApps({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const [expandido, setExpandido] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const agente = dispositivo.agente;
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
    if (ocupado) return;
    vibrar(15);
    setOcupado(`${app}:${acao}`);
    try {
      await apiPost(ROTAS.appAcao, { dispositivo: dispositivo.id, app, acao });
    } catch {
      // erro já virou toast pelo cliente de API
    } finally {
      setOcupado(null);
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
                      className="controle-apps__acao"
                      disabled={ocupado !== null}
                      onClick={() => void acionar(app, acao)}
                    >
                      {ocupado === `${app}:${acao}` ? '…' : ROTULOS[acao]}
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
