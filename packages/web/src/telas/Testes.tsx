import { useEffect, useState } from 'react';
import type { ResultadoCheck, StatusPasso } from '@maestro/shared';
import { ROTAS } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

type TipoCheck = 'legendas' | 'ndi';

const ICONES: Record<StatusPasso, string> = {
  ok: '✅',
  falha: '❌',
  aviso: '⚠️',
  pulado: '⏭️',
};

const ROTULOS_BOTAO: Record<TipoCheck, string> = {
  legendas: 'Testar legendas',
  ndi: 'Testar NDI',
};

export function Testes() {
  const { resultadosCheck } = useAppContexto();
  const [rodando, setRodando] = useState<TipoCheck | null>(null);
  const [resultado, setResultado] = useState<ResultadoCheck | null>(null);

  // Enquanto um check roda, o hub pode ir empurrando o resultado parcial pelo
  // WebSocket (mensagens tipo "check") — usamos o mais recente como progresso
  // ao vivo, e o corpo da resposta do POST como veredito final.
  useEffect(() => {
    if (!rodando) return;
    const valores = Object.values(resultadosCheck);
    if (valores.length === 0) return;
    const maisRecente = valores.reduce((a, b) => (b.ts > a.ts ? b : a));
    setResultado(maisRecente);
  }, [resultadosCheck, rodando]);

  async function rodar(tipo: TipoCheck): Promise<void> {
    if (rodando) return;
    vibrar(15);
    setRodando(tipo);
    setResultado(null);
    try {
      const rota = tipo === 'legendas' ? ROTAS.checkLegendas : ROTAS.checkNdi;
      const final = await apiPost<ResultadoCheck>(rota);
      setResultado(final);
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setRodando(null);
    }
  }

  return (
    <div className="testes">
      <div className="testes__botoes">
        <button
          type="button"
          className="botao-acao"
          disabled={rodando !== null}
          onClick={() => void rodar('legendas')}
        >
          {rodando === 'legendas' ? 'Testando legendas…' : ROTULOS_BOTAO.legendas}
        </button>
        <button type="button" className="botao-acao" disabled={rodando !== null} onClick={() => void rodar('ndi')}>
          {rodando === 'ndi' ? 'Testando NDI…' : ROTULOS_BOTAO.ndi}
        </button>
      </div>

      {rodando && !resultado ? <p className="testes__progresso">Rodando testes…</p> : null}

      {resultado ? (
        <section className={`resultado-check resultado-check--${resultado.status}`}>
          <header className="resultado-check__cabecalho">
            <h2>{resultado.titulo}</h2>
            <p>{resultado.resumo}</p>
          </header>
          <ol className="resultado-check__passos">
            {resultado.passos.map((passo) => (
              <li key={passo.id} className={`passo-check passo-check--${passo.status}`}>
                <span className="passo-check__icone" aria-hidden="true">
                  {ICONES[passo.status]}
                </span>
                <div className="passo-check__corpo">
                  <p className="passo-check__titulo">{passo.titulo}</p>
                  <p className="passo-check__detalhe">{passo.detalhe}</p>
                  {passo.comoResolver ? (
                    <p className="passo-check__resolver">Como resolver: {passo.comoResolver}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
