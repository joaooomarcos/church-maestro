import { useEffect, useState } from 'react';
import { ROTAS, type MaquinaNdiConfig, type RespostaNdiConfig } from '@maestro/shared';
import { apiGet, apiPut } from '../nucleo/cliente';
import { nomeDoMonitor } from '../nucleo/monitores';
import '../estilos/ndi.css';

/**
 * Ajustes › NDI: em que monitor cada janela do Studio Monitor aparece e qual
 * monitor o NDI Screen Capture de cada máquina envia. O teste do NDI captura
 * esses dois monitores e compara os prints.
 *
 * Não recebe props: carrega e grava sozinho. Cada escolha é salva na hora.
 */

function SeletorMonitor({
  maquina,
  valor,
  vazio,
  aoEscolher,
}: {
  maquina: MaquinaNdiConfig;
  valor: string | null;
  /** Texto da opção "nenhum" (janela sem monitor informado, ou o principal no envio). */
  vazio: string;
  aoEscolher: (monitor: string | null) => void;
}) {
  const monitores = maquina.monitores;
  if (!monitores) {
    return (
      <p className="versoes__dica">
        {maquina.online
          ? 'Atualize o agente desta máquina para listar os monitores.'
          : 'Máquina fora do ar: ligue-a para escolher o monitor.'}
      </p>
    );
  }
  const conhecido = !valor || monitores.some((m) => m.id === valor);
  return (
    <select className="versoes__select" value={valor ?? ''} onChange={(e) => aoEscolher(e.target.value || null)}>
      <option value="">{vazio}</option>
      {monitores.map((monitor) => (
        <option key={monitor.id} value={monitor.id}>
          {nomeDoMonitor(monitor)}
        </option>
      ))}
      {conhecido || !valor ? null : <option value={valor}>{valor} (desconectado)</option>}
    </select>
  );
}

/** Seção "NDI" de Ajustes. */
export function AjustesNdi() {
  const [dados, setDados] = useState<RespostaNdiConfig | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiGet<RespostaNdiConfig>(ROTAS.ndiConfig)
      .then(setDados)
      .catch(() => {
        // erro já virou toast
      });
  }, []);

  async function salvar(corpo: { dispositivo: string; janelas?: Record<string, string | null>; envioMonitor?: string | null }): Promise<void> {
    setSalvando(true);
    try {
      setDados(await apiPut<RespostaNdiConfig>(ROTAS.ndiConfig, corpo));
    } catch {
      // erro já virou toast; a lista continua como estava
    } finally {
      setSalvando(false);
    }
  }

  if (!dados || dados.maquinas.length === 0) return null;

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">NDI</h2>
      <p className="versoes__dica">
        O teste do NDI tira um print do monitor que a máquina de origem envia e outro do monitor onde a janela do
        Studio Monitor aparece, e compara os dois. Informe aqui qual monitor é qual.
      </p>
      {dados.maquinas.map((maquina) => (
        <div key={maquina.id} className="ajustes-ndi__maquina">
          <p className="ajustes-ndi__nome">{maquina.nome}</p>
          {!maquina.online ? <p className="info ajustes-ndi__status">Fora do ar</p> : null}

          {maquina.janelas.map((janela) => (
            <label key={janela.porta} className="campo">
              <span className="campo__rotulo">Janela {janela.porta} do Studio Monitor aparece no monitor</span>
              <SeletorMonitor
                maquina={maquina}
                valor={janela.monitor}
                vazio="Não informado"
                aoEscolher={(monitor) =>
                  !salvando && void salvar({ dispositivo: maquina.id, janelas: { [String(janela.porta)]: monitor } })
                }
              />
            </label>
          ))}

          <label className="campo">
            <span className="campo__rotulo">NDI Screen Capture envia o monitor</span>
            <SeletorMonitor
              maquina={maquina}
              valor={maquina.envioMonitor}
              vazio="Principal (padrão do Screen Capture)"
              aoEscolher={(monitor) => !salvando && void salvar({ dispositivo: maquina.id, envioMonitor: monitor })}
            />
          </label>
        </div>
      ))}
    </section>
  );
}
