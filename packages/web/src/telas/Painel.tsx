import { useEffect, useState } from 'react';
import type { Cenario, EstadoDispositivo } from '@maestro/shared';
import { ROTAS } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPost } from '../nucleo/cliente';
import { Semaforo, type EstadoSemaforo } from '../componentes/Semaforo';
import { ControleApps } from '../componentes/ControleApps';
import { vibrar } from '../nucleo/vibrar';

function estadoSemaforoDispositivo(d: EstadoDispositivo): EstadoSemaforo {
  if (d.ultimoContato === null) return 'nao-configurado';
  return d.online ? 'online' : 'offline';
}

function resumoHolyrics(d: EstadoDispositivo): string | null {
  if (!d.holyrics) return null;
  if (!d.holyrics.online) return d.holyrics.erro ?? 'Sem conexão com o Holyrics';
  const apresentacao = d.holyrics.apresentacao;
  if (!apresentacao) return 'Sem apresentação';
  return `${apresentacao.nome} — slide ${apresentacao.slide ?? '?'}/${apresentacao.totalSlides ?? '?'}`;
}

function resumoPowerPoint(d: EstadoDispositivo): string | null {
  if (!d.powerpoint) return null;
  if (!d.powerpoint.online) return d.powerpoint.erro ?? 'PowerPoint fechado';
  if (!d.powerpoint.emApresentacao) return 'Fora do modo apresentação';
  return `Slide ${d.powerpoint.slide ?? '?'} de ${d.powerpoint.totalSlides ?? '?'}`;
}

/**
 * Quais programas a máquina tem abertos. Vale mesmo para o Note Som, que não
 * tem projeção nenhuma — saber que o agente responde já diz que a máquina está
 * ligada e pronta.
 */
const NOMES_APLICATIVOS: Record<string, string> = {
  obs: 'OBS',
  holyrics: 'Holyrics',
  powerpoint: 'PowerPoint',
  'ndi-studio-monitor': 'Studio Monitor',
  'ndi-screen-capture': 'Screen Capture',
};

function resumoAgente(d: EstadoDispositivo): string | null {
  if (!d.agente) return null;
  if (!d.agente.online) return d.agente.erro ?? 'Agente sem resposta';
  const abertos = Object.entries(d.agente.processos)
    .filter(([, aberto]) => aberto)
    .map(([chave]) => NOMES_APLICATIVOS[chave] ?? chave);
  return abertos.length > 0 ? abertos.join(', ') : 'nenhum programa aberto';
}

/** Qual janela está na frente naquela máquina — o que está indo para a tela. */
function resumoPrimeiroPlano(d: EstadoDispositivo): string | null {
  const janela = d.agente?.emPrimeiroPlano;
  if (!janela) return null;
  const nome = janela.app ? (NOMES_APLICATIVOS[janela.app] ?? janela.processo) : janela.processo;
  if (!janela.titulo) return nome;
  // O título da janela quase sempre já traz o nome do programa ("Louvor - PowerPoint").
  return janela.titulo.toLowerCase().includes(nome.toLowerCase())
    ? janela.titulo
    : `${nome} — ${janela.titulo}`;
}

function resumoObs(d: EstadoDispositivo): { texto: string; alerta: boolean } | null {
  if (!d.obs) return null;
  if (!d.obs.online) return { texto: d.obs.erro ?? 'Sem conexão com o OBS', alerta: false };
  if (!d.obs.transmitindo) return { texto: 'Não transmitindo', alerta: false };
  return {
    texto: `Transmitindo · ${Math.round(d.obs.bitrateKbps)} kbps`,
    alerta: d.obs.percFramesPerdidos > 1,
  };
}

function resumoNdi(d: EstadoDispositivo): Array<{ porta: number; texto: string }> {
  return d.ndi.map((janela) => ({
    porta: janela.porta,
    texto: `janela ${janela.porta}: ${janela.fonteAtual ?? 'nenhuma fonte'}`,
  }));
}

export function Painel() {
  const { snapshot, notificar } = useAppContexto();
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [executando, setExecutando] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Cenario[] | { cenarios: Cenario[] }>(ROTAS.cenarios)
      .then((resposta) => setCenarios(Array.isArray(resposta) ? resposta : resposta.cenarios))
      .catch(() => {
        // erro já virou toast pelo cliente de API.
      });
  }, []);

  async function executarCenario(cenario: Cenario): Promise<void> {
    vibrar(15);
    setExecutando(cenario.id);
    try {
      await apiPost(ROTAS.executarCenario, { cenarioId: cenario.id });
      notificar(`Cenário "${cenario.nome}" aplicado.`, 'info');
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setExecutando(null);
    }
  }

  return (
    <div className="painel">
      {cenarios.length > 0 ? (
        <section className="painel__cenarios">
          {cenarios.map((cenario) => (
            <button
              key={cenario.id}
              type="button"
              className="botao-cenario"
              disabled={executando === cenario.id}
              onClick={() => void executarCenario(cenario)}
            >
              <span className="botao-cenario__icone" aria-hidden="true">
                {cenario.icone ?? '▶'}
              </span>
              <span>{executando === cenario.id ? 'Aplicando…' : cenario.nome}</span>
            </button>
          ))}
        </section>
      ) : null}

      <section className="painel__dispositivos">
        {!snapshot ? (
          <p className="painel__vazio">Carregando dispositivos…</p>
        ) : snapshot.dispositivos.length === 0 ? (
          <p className="painel__vazio">Nenhum dispositivo cadastrado.</p>
        ) : (
          snapshot.dispositivos.map((dispositivo) => {
            const obs = resumoObs(dispositivo);
            const holyrics = resumoHolyrics(dispositivo);
            const powerpoint = resumoPowerPoint(dispositivo);
            const ndi = resumoNdi(dispositivo);
            const agente = resumoAgente(dispositivo);
            const primeiroPlano = resumoPrimeiroPlano(dispositivo);
            return (
              <article key={dispositivo.id} className="cartao-dispositivo">
                <header className="cartao-dispositivo__cabecalho">
                  <Semaforo estado={estadoSemaforoDispositivo(dispositivo)} />
                  <h2>{dispositivo.nome}</h2>
                </header>
                {holyrics === null &&
                powerpoint === null &&
                ndi.length === 0 &&
                obs === null &&
                agente === null ? (
                  <p className="cartao-dispositivo__sem-integracao">Sem integrações configuradas.</p>
                ) : (
                  <ul className="cartao-dispositivo__integracoes">
                    {agente !== null ? <li>Aberto: {agente}</li> : null}
                    {primeiroPlano !== null ? <li>Na frente: {primeiroPlano}</li> : null}
                    {holyrics !== null ? <li>Holyrics: {holyrics}</li> : null}
                    {powerpoint !== null ? <li>PowerPoint: {powerpoint}</li> : null}
                    {ndi.map((janela) => (
                      <li key={janela.porta}>NDI — {janela.texto}</li>
                    ))}
                    {obs !== null ? (
                      <li className={obs.alerta ? 'cartao-dispositivo__alerta' : ''}>
                        OBS: {obs.texto}
                        {obs.alerta ? ' ⚠ perda de frames' : ''}
                      </li>
                    ) : null}
                  </ul>
                )}
                <ControleApps dispositivo={dispositivo} />
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
