import { useState } from 'react';
import { vibrar } from '../nucleo/vibrar';

const TECLAS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'vazia', '0', 'apagar'] as const;
export const TAMANHO_PIN = 4;

/**
 * Teclado de PIN: 4 bolinhas, teclado numérico e apagar. Entra sozinho no 4º
 * dígito chamando `aoCompletar`, que devolve a mensagem de erro (ou nada, se
 * deu certo). Em erro limpa, vibra e mostra a mensagem. Usado pelo PIN da
 * equipe e pela página do convidado.
 */
export function TecladoPin({
  aoCompletar,
}: {
  aoCompletar: (pin: string) => Promise<string | null | undefined>;
}) {
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(pinAtual: string): Promise<void> {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    const mensagem = await aoCompletar(pinAtual);
    setEnviando(false);
    if (mensagem) {
      vibrar([20, 40, 20]);
      setErro(mensagem);
      setPin('');
    }
  }

  function tocar(tecla: (typeof TECLAS)[number]): void {
    vibrar(15);
    if (tecla === 'apagar') {
      setPin((atual) => atual.slice(0, -1));
      return;
    }
    if (tecla === 'vazia' || enviando) return;
    if (pin.length >= TAMANHO_PIN) return;
    const novo = pin + tecla;
    setPin(novo);
    setErro(null);
    // Entra sozinho no 4º dígito: não há botão de confirmar.
    if (novo.length === TAMANHO_PIN) void enviar(novo);
  }

  return (
    <>
      <div className="tela-pin__pontos" aria-live="polite">
        {Array.from({ length: TAMANHO_PIN }, (_, indice) => (
          <span
            key={indice}
            className={`tela-pin__ponto${indice < pin.length ? ' tela-pin__ponto--preenchido' : ''}`}
          />
        ))}
      </div>

      {erro ? <p className="tela-pin__erro">{erro}</p> : null}

      <div className="tela-pin__teclado">
        {TECLAS.map((tecla) =>
          tecla === 'vazia' ? (
            <span key={tecla} className="tela-pin__tecla tela-pin__tecla--vazia" aria-hidden="true" />
          ) : (
            <button
              key={tecla}
              type="button"
              className={`tela-pin__tecla${tecla === 'apagar' ? ' tela-pin__tecla--apagar' : ''}`}
              disabled={enviando}
              aria-label={tecla === 'apagar' ? 'Apagar' : undefined}
              onClick={() => tocar(tecla)}
            >
              {tecla === 'apagar' ? '⌫' : tecla}
            </button>
          ),
        )}
      </div>
    </>
  );
}
