import { useMemo, useState } from 'react';
import type { EstadoDispositivo } from '@maestro/shared';
import { ROTAS } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

interface JanelaNdi {
  dispositivoId: string;
  dispositivoNome: string;
  porta: number;
  fonteAtual: string | null;
  fontesDisponiveis: string[];
}

function coletarJanelas(dispositivos: EstadoDispositivo[]): JanelaNdi[] {
  const janelas: JanelaNdi[] = [];
  for (const dispositivo of dispositivos) {
    for (const ndi of dispositivo.ndi) {
      janelas.push({
        dispositivoId: dispositivo.id,
        dispositivoNome: dispositivo.nome,
        porta: ndi.porta,
        fonteAtual: ndi.fonteAtual,
        fontesDisponiveis: ndi.fontesDisponiveis,
      });
    }
  }
  return janelas;
}

export function Ndi() {
  const { snapshot } = useAppContexto();
  // Enquanto o snapshot real não confirma, mostra a seleção que a pessoa acabou de tocar.
  const [selecaoOtimista, setSelecaoOtimista] = useState<Record<string, string | null>>({});
  const [enviando, setEnviando] = useState<string | null>(null);

  const janelas = useMemo(() => coletarJanelas(snapshot?.dispositivos ?? []), [snapshot]);

  async function selecionar(janela: JanelaNdi, fonte: string | null): Promise<void> {
    const chave = `${janela.dispositivoId}:${janela.porta}`;
    vibrar(15);
    setSelecaoOtimista((atual) => ({ ...atual, [chave]: fonte }));
    setEnviando(chave);
    try {
      await apiPost(ROTAS.ndiFonte, { dispositivo: janela.dispositivoId, porta: janela.porta, fonte });
    } catch {
      // erro já virou toast; o próximo snapshot corrige a UI se a troca não colou.
    } finally {
      setEnviando((atual) => (atual === chave ? null : atual));
    }
  }

  if (janelas.length === 0) {
    return <p className="ndi__vazio">Nenhuma janela de Studio Monitor encontrada.</p>;
  }

  return (
    <div className="ndi">
      {janelas.map((janela) => {
        const chave = `${janela.dispositivoId}:${janela.porta}`;
        const valorOtimista = selecaoOtimista[chave];
        const atual = valorOtimista !== undefined ? valorOtimista : janela.fonteAtual;
        return (
          <section key={chave} className="ndi__bloco">
            <h2>
              {janela.dispositivoNome} — janela {janela.porta}
            </h2>
            <select
              className="versoes__select"
              aria-label={`Fonte da janela ${janela.porta} do ${janela.dispositivoNome}`}
              value={atual ?? ''}
              disabled={enviando === chave}
              onChange={(evento) => void selecionar(janela, evento.target.value || null)}
            >
              <option value="">Nenhuma</option>
              {/* A fonte atual pode ter saído da rede; ainda assim ela aparece selecionada. */}
              {(atual && !janela.fontesDisponiveis.includes(atual)
                ? [atual, ...janela.fontesDisponiveis]
                : janela.fontesDisponiveis
              ).map((fonte) => (
                <option key={fonte} value={fonte}>
                  {fonte}
                </option>
              ))}
            </select>
          </section>
        );
      })}
    </div>
  );
}
