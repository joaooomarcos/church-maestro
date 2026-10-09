import { MONITOR_TODOS, type EstadoDispositivo } from '@maestro/shared';
import { nomeDoMonitor } from '../nucleo/monitores';
import '../estilos/avisos.css';

/** Quanto tempo o aviso fica na tela: null = até alguém clicar em "Ok". */
export const DURACOES: ReadonlyArray<{ segundos: number | null; rotulo: string }> = [
  { segundos: null, rotulo: 'Até Ok' },
  { segundos: 5, rotulo: '5 s' },
  { segundos: 10, rotulo: '10 s' },
  { segundos: 20, rotulo: '20 s' },
  { segundos: 30, rotulo: '30 s' },
  { segundos: 60, rotulo: '1 min' },
];

/** Sem escolha explícita, a máquina usa o monitor padrão dela (Ajustes). Só os cenários usam. */
export const MONITOR_PADRAO = 'padrao';

/** O monitor principal da máquina, ou null se ela não informou os monitores. */
export function monitorPrincipal(maquina: EstadoDispositivo): string | null {
  return maquina.agente?.monitores?.find((m) => m.principal)?.id ?? null;
}

/** Máquina com mais de uma tela (ou com escolha salva): é preciso dizer em qual o aviso abre. */
export function precisaEscolherTela(maquina: EstadoDispositivo, monitores: Record<string, string | null>): boolean {
  return (maquina.agente?.monitores?.length ?? 0) > 1 || Boolean(monitores[maquina.id]);
}

interface PropsDuracao {
  segundos: number | null;
  aoEscolherSegundos: (segundos: number | null) => void;
}

/** Quanto tempo o aviso fica: uma fileira só de opções curtas. */
export function DuracaoAviso({ segundos, aoEscolherSegundos }: PropsDuracao) {
  return (
    <div className="campo">
      <span className="campo__rotulo">Quanto tempo fica na tela</span>
      <div className="avisos-duracao" role="group" aria-label="Quanto tempo fica na tela">
        {DURACOES.map((opcao) => {
          const marcado = segundos === opcao.segundos;
          return (
            <button
              key={opcao.rotulo}
              type="button"
              aria-pressed={marcado}
              className={`avisos-duracao__opcao${marcado ? ' avisos-duracao__opcao--marcada' : ''}`}
              onClick={() => aoEscolherSegundos(opcao.segundos)}
            >
              {opcao.rotulo}
            </button>
          );
        })}
      </div>
      {segundos === null ? (
        <p className="avisos-dica">Fica até alguém tocar em "Ok" ou apertar Esc. No telão, prefira um tempo.</p>
      ) : null}
    </div>
  );
}

interface PropsTelas {
  /** As máquinas onde o aviso vai aparecer. */
  maquinas: EstadoDispositivo[];
  /** Monitor escolhido por máquina (id, MONITOR_TODOS ou null = principal). Ausente = ainda não escolheu. */
  monitores: Record<string, string | null>;
  aoEscolherMonitor: (idMaquina: string, monitor: string | null | undefined) => void;
  /** Cenários: oferece "Padrão da máquina" e parte dele. Na tela de envio parte do principal. */
  comPadrao?: boolean;
}

/** Em qual tela o aviso abre, só para as máquinas com mais de uma. */
export function TelasAviso({ maquinas, monitores, aoEscolherMonitor, comPadrao = false }: PropsTelas) {
  return (
    <>
      {maquinas
        .filter((maquina) => precisaEscolherTela(maquina, monitores))
        .map((maquina) => {
          const lista = maquina.agente?.monitores ?? [];
          const escolhido = monitores[maquina.id];
          const principal = monitorPrincipal(maquina);
          const atual =
            escolhido === undefined ? (comPadrao ? MONITOR_PADRAO : principal) : (escolhido ?? principal);
          const opcoes = [
            ...(comPadrao ? [{ id: MONITOR_PADRAO, nome: 'Padrão da máquina' }] : []),
            ...lista.map((m) => ({ id: m.id, nome: nomeDoMonitor(m) })),
            { id: MONITOR_TODOS, nome: 'Todas as telas' },
          ];
          // Escolha salva de um monitor que não está mais ligado continua visível.
          if (escolhido && escolhido !== MONITOR_TODOS && !lista.some((m) => m.id === escolhido)) {
            opcoes.push({ id: escolhido, nome: `${escolhido} (desconectado)` });
          }
          return (
            <div key={maquina.id} className="campo avisos-tela">
              <span className="campo__rotulo">Tela em {maquina.nome}</span>
              <div className="seletor-dias seletor-dias--livre">
                {opcoes.map((opcao) => (
                  <button
                    key={opcao.id}
                    type="button"
                    aria-pressed={atual === opcao.id}
                    className={`seletor-dias__dia${atual === opcao.id ? ' seletor-dias__dia--marcado' : ''}`}
                    onClick={() => aoEscolherMonitor(maquina.id, opcao.id === MONITOR_PADRAO ? undefined : opcao.id)}
                  >
                    {opcao.nome}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
    </>
  );
}

type Props = PropsTelas & PropsDuracao;

/** Em que tela o aviso abre e quanto tempo ele fica — o que se decide na hora de mandar. */
export function OpcoesAviso({ maquinas, monitores, aoEscolherMonitor, segundos, aoEscolherSegundos, comPadrao = false }: Props) {
  return (
    <>
      <DuracaoAviso segundos={segundos} aoEscolherSegundos={aoEscolherSegundos} />
      <TelasAviso
        maquinas={maquinas}
        monitores={monitores}
        aoEscolherMonitor={aoEscolherMonitor}
        comPadrao={comPadrao}
      />
    </>
  );
}
