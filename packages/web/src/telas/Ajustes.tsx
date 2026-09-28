import { useEffect, useState } from 'react';
import { ROTAS, type Ajustes as AjustesHub } from '@maestro/shared';
import { apiGet, apiPost } from '../nucleo/cliente';

const INTERVALOS_HEARTBEAT = [5, 10, 20, 30, 60];

/** Ajustes da operação que valem para todas as máquinas. */
export function Ajustes() {
  const [segundos, setSegundos] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiGet<AjustesHub>(ROTAS.ajustes)
      .then((ajustes) => setSegundos(Math.round(ajustes.intervaloHeartbeatMs / 1000)))
      .catch(() => {
        // erro já virou toast
      });
  }, []);

  async function salvar(novoEmSegundos: number): Promise<void> {
    const anterior = segundos;
    setSegundos(novoEmSegundos);
    setSalvando(true);
    try {
      await apiPost(ROTAS.ajustes, { intervaloHeartbeatMs: novoEmSegundos * 1000 });
    } catch {
      setSegundos(anterior);
    } finally {
      setSalvando(false);
    }
  }

  if (segundos === null) return null;

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Aviso de "estou viva"</h2>
      <select
        className="versoes__select"
        value={segundos}
        disabled={salvando}
        onChange={(evento) => void salvar(Number(evento.target.value))}
      >
        {INTERVALOS_HEARTBEAT.map((valor) => (
          <option key={valor} value={valor}>
            a cada {valor} segundos
          </option>
        ))}
      </select>
      <p className="versoes__dica">
        De quanto em quanto tempo cada máquina avisa o hub que está no ar. Vale para todas; um
        intervalo menor deixa o painel mais rápido em perceber uma queda.
      </p>
    </section>
  );
}
