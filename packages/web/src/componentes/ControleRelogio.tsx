import { useEffect, useState } from 'react';
import {
  NOMES_POSICOES_RELOGIO,
  POSICOES_RELOGIO,
  ROTAS,
  TAMANHOS_RELOGIO,
  type EstadoRelogio,
  type MudancaRelogio,
} from '@maestro/shared';
import { apiGet, apiPost, TEMPO_LIMITE_COMANDO_MS } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { Icone } from './Icone';

/**
 * Relógio que o Holyrics desenha no telão. Fica fechado até alguém abrir: a
 * leitura traz a imagem do papel de parede inteira, pesada demais para fazer
 * a cada troca de máquina no meio do culto.
 */
export function ControleRelogio({ dispositivoId }: { dispositivoId: string }) {
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<EstadoRelogio | null>(null);
  const [erro, setErro] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setEstado(null);
    setErro(false);
    if (!aberto) return undefined;
    let valido = true;
    apiGet<EstadoRelogio>(`${ROTAS.holyricsRelogio}?dispositivo=${encodeURIComponent(dispositivoId)}`)
      .then((resposta) => {
        if (valido) setEstado(resposta);
      })
      .catch(() => {
        if (valido) setErro(true);
      });
    return () => {
      valido = false;
    };
  }, [aberto, dispositivoId]);

  async function mudar(mudanca: MudancaRelogio): Promise<void> {
    if (enviando) return;
    vibrar(15);
    setEnviando(true);
    try {
      setEstado(
        await apiPost<EstadoRelogio>(ROTAS.holyricsRelogio, { dispositivo: dispositivoId, ...mudanca }, TEMPO_LIMITE_COMANDO_MS),
      );
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="relogio">
      <button type="button" className="relogio__cabecalho" aria-expanded={aberto} onClick={() => setAberto(!aberto)}>
        <span className="holyrics__playlist-titulo">Relógio do telão</span>
        <Icone nome={aberto ? 'subir' : 'descer'} tamanho={18} />
      </button>

      {!aberto ? null : erro ? (
        <p className="versoes__dica">Não consegui ler o relógio do Holyrics.</p>
      ) : !estado ? (
        <p className="versoes__dica">Lendo o relógio…</p>
      ) : (
        <>
          <div className="passo-editor__opcao">
            <span>Mostrar o relógio</span>
            <button
              type="button"
              role="switch"
              aria-checked={estado.mostrar}
              aria-label="Mostrar o relógio"
              disabled={enviando}
              className={`interruptor${estado.mostrar ? ' interruptor--ligado' : ''}`}
              onClick={() => void mudar({ mostrar: !estado.mostrar })}
            >
              <span className="interruptor__bolinha" />
            </button>
          </div>

          <div className="relogio__tela" role="group" aria-label="Posição do relógio">
            {POSICOES_RELOGIO.map((posicao) => {
              const atual = estado.posicao === posicao;
              return (
                <button
                  key={posicao}
                  type="button"
                  className={`relogio__posicao${atual ? ' relogio__posicao--atual' : ''}`}
                  aria-pressed={atual}
                  aria-label={NOMES_POSICOES_RELOGIO[posicao]}
                  title={NOMES_POSICOES_RELOGIO[posicao]}
                  disabled={enviando}
                  onClick={() => void mudar({ posicao })}
                >
                  {atual ? '12:00' : null}
                </button>
              );
            })}
          </div>

          <label className="campo">
            <span className="campo__rotulo">Tamanho</span>
            <select
              className="versoes__select"
              value={estado.tamanho ?? ''}
              disabled={enviando}
              onChange={(e) => void mudar({ tamanho: Number(e.target.value) })}
            >
              {estado.tamanho === null ? <option value="">—</option> : null}
              {TAMANHOS_RELOGIO.map((tamanho) => (
                <option key={tamanho} value={tamanho}>
                  {tamanho}%
                </option>
              ))}
            </select>
          </label>
          <p className="versoes__dica">
            O relógio aparece sobre o papel de parede do Holyrics. Para mudar sozinho num horário, use o passo
            "Relógio do Holyrics" num cenário.
          </p>
        </>
      )}
    </section>
  );
}
