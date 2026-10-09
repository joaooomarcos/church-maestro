/**
 * Faixa fina de "só informação" no alto das telas de passar slide: título à
 * esquerda, contador "1/14" à direita e uma barra de progresso finíssima.
 * Não é tocável de propósito (ver regras de design em estilos.css).
 */
export function FaixaTitulo({
  titulo,
  complemento,
  slide,
  total,
}: {
  titulo: string;
  /** Texto leve ao lado do título (o artista da música). */
  complemento?: string;
  slide: number | null;
  total: number | null;
}) {
  const progresso = slide && total ? Math.min(100, Math.max(0, (slide / total) * 100)) : 0;
  return (
    <div className="info faixa-titulo">
      <div className="faixa-titulo__linha">
        <p className="faixa-titulo__titulo">
          <span className="faixa-titulo__nome">{titulo}</span>
          {complemento ? <span className="faixa-titulo__complemento"> ({complemento})</span> : null}
        </p>
        <span className="faixa-titulo__contador">
          {slide ?? '?'}/{total ?? '?'}
        </span>
      </div>
      <div className="faixa-titulo__barra" aria-hidden="true">
        <span className="faixa-titulo__preenchimento" style={{ width: `${progresso}%` }} />
      </div>
    </div>
  );
}
