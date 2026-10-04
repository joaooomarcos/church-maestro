import { MONITOR_TODOS, type EstadoDispositivo } from '@maestro/shared';
import { nomeDoMonitor } from '../nucleo/monitores';

/** Quanto tempo o aviso fica na tela: null = até alguém clicar em "Ok". */
const DURACOES: ReadonlyArray<{ segundos: number | null; rotulo: string }> = [
  { segundos: null, rotulo: 'Até clicar em Ok' },
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

interface Props {
  /** As máquinas onde o aviso vai aparecer. */
  maquinas: EstadoDispositivo[];
  /** Monitor escolhido por máquina (id, MONITOR_TODOS ou null = principal). Ausente = ainda não escolheu. */
  monitores: Record<string, string | null>;
  aoEscolherMonitor: (idMaquina: string, monitor: string | null | undefined) => void;
  segundos: number | null;
  aoEscolherSegundos: (segundos: number | null) => void;
  /** Cenários: oferece "Padrão da máquina" e parte dele. Na tela de envio parte do principal. */
  comPadrao?: boolean;
}

/** Em que tela o aviso abre e quanto tempo ele fica — o que se decide na hora de mandar. */
export function OpcoesAviso({ maquinas, monitores, aoEscolherMonitor, segundos, aoEscolherSegundos, comPadrao = false }: Props) {
  return (
    <>
      <div className="campo">
        <span className="campo__rotulo">Quanto tempo fica na tela</span>
        <div className="seletor-dias seletor-dias--livre">
          {DURACOES.map((opcao) => (
            <button
              key={opcao.rotulo}
              type="button"
              aria-pressed={segundos === opcao.segundos}
              className={`seletor-dias__dia${segundos === opcao.segundos ? ' seletor-dias__dia--marcado' : ''}`}
              onClick={() => aoEscolherSegundos(opcao.segundos)}
            >
              {opcao.rotulo}
            </button>
          ))}
        </div>
        {segundos === null ? (
          <p className="versoes__dica">
            Fica até alguém clicar em "Ok" ou apertar Esc. No telão, prefira um tempo: se ninguém estiver por
            perto, o aviso fica lá.
          </p>
        ) : null}
      </div>

      {maquinas
        .filter((maquina) => (maquina.agente?.monitores?.length ?? 0) > 1 || monitores[maquina.id])
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
            <div key={maquina.id} className="campo">
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
