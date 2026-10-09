import { useState } from 'react';
import { ROTAS, type EstadoDispositivo, type ResultadoAcordar } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { Icone } from './Icone';
import '../estilos/painel.css';

/**
 * Botão de ícone para ligar/acordar a máquina. Sempre envia o pedido: uma
 * máquina dormindo pode aparecer como online, então não dá para confiar no selo.
 */
export function BotaoLigar({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const { notificar } = useAppContexto();
  const [acordando, setAcordando] = useState(false);

  async function acordar(): Promise<void> {
    vibrar(15);
    setAcordando(true);
    notificar('Tentando acordar a máquina…', 'info');
    try {
      const resultado = await apiPost<ResultadoAcordar>(ROTAS.acordar, { dispositivo: dispositivo.id });
      notificar(resultado.mensagem, resultado.telaAcordada || resultado.sinalEnviado ? 'info' : 'alerta');
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setAcordando(false);
    }
  }

  return (
    <button
      type="button"
      className="tocavel botao-ligar"
      disabled={acordando}
      aria-busy={acordando}
      aria-label={`Ligar ${dispositivo.nome}`}
      title="Ligar / acordar"
      onClick={(evento) => {
        evento.stopPropagation();
        void acordar();
      }}
    >
      <Icone nome="ligar" tamanho={20} />
    </button>
  );
}
