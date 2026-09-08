import { useState } from 'react';
import { useAppContexto } from '../contexto/AppContext';
import { vibrar } from '../nucleo/vibrar';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'apagar', '0', 'entrar'] as const;

export function TelaPin() {
  const { entrar } = useAppContexto();
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(pinAtual: string): Promise<void> {
    if (!pinAtual || enviando) return;
    setEnviando(true);
    setErro(null);
    const resultado = await entrar(pinAtual);
    setEnviando(false);
    if (!resultado.ok) {
      vibrar([20, 40, 20]);
      setErro(resultado.mensagem ?? 'PIN incorreto.');
      setPin('');
    }
  }

  function tocar(tecla: (typeof TECLAS)[number]): void {
    vibrar(15);
    if (tecla === 'apagar') {
      setPin((atual) => atual.slice(0, -1));
      return;
    }
    if (tecla === 'entrar') {
      void enviar(pin);
      return;
    }
    setPin((atual) => (atual.length >= 10 ? atual : atual + tecla));
  }

  return (
    <div className="tela-pin">
      <h1 className="tela-pin__titulo">Maestro</h1>
      <p className="tela-pin__subtitulo">Digite o PIN da equipe</p>

      <div className="tela-pin__pontos" aria-live="polite">
        {Array.from({ length: Math.max(pin.length, 1) }, (_, indice) => (
          <span
            key={indice}
            className={`tela-pin__ponto${indice < pin.length ? ' tela-pin__ponto--preenchido' : ''}`}
          />
        ))}
      </div>

      {erro ? <p className="tela-pin__erro">{erro}</p> : null}

      <div className="tela-pin__teclado">
        {TECLAS.map((tecla) => (
          <button
            key={tecla}
            type="button"
            className={`tela-pin__tecla${tecla === 'entrar' ? ' tela-pin__tecla--entrar' : ''}${
              tecla === 'apagar' ? ' tela-pin__tecla--apagar' : ''
            }`}
            disabled={enviando}
            onClick={() => tocar(tecla)}
          >
            {tecla === 'apagar' ? '⌫' : tecla === 'entrar' ? (enviando ? '…' : '✓') : tecla}
          </button>
        ))}
      </div>
    </div>
  );
}
