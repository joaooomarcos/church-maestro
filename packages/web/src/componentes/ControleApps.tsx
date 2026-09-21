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

/** Fechado, só faz sentido abrir; aberto, o resto. */
function acoesPara(aberto: boolean): AcaoApp[] {
  return aberto ? ['frente', 'reiniciar', 'fechar'] : ['abrir'];
}

export function ControleApps({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const [expandido, setExpandido] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const agente = dispositivo.agente;
  if (!agente?.online) return null;

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
      <button
        type="button"
        className="controle-apps__alternar"
        onClick={() => setExpandido((atual) => !atual)}
      >
        {expandido ? 'Esconder programas' : 'Programas desta máquina'}
      </button>

      {expandido ? (
        <ul className="controle-apps__lista">
          {APLICATIVOS.map((app) => {
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
