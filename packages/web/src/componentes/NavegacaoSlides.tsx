import { Icone } from './Icone';

/**
 * Rodapé de Anterior/Próximo: os botões mais usados no culto. Próximo é maior e
 * sólido; Anterior fica menor e discreto para não ser tocado sem querer. A seta é
 * o elemento principal, o texto é só apoio.
 */
export function NavegacaoSlides({
  desabilitado,
  aoAnterior,
  aoProximo,
}: {
  desabilitado: boolean;
  aoAnterior: () => void;
  aoProximo: () => void;
}) {
  return (
    <div className="nav-slides">
      <button type="button" className="nav-slides__anterior" disabled={desabilitado} onClick={aoAnterior}>
        <Icone nome="seta-esq" tamanho={30} />
        <span>Anterior</span>
      </button>
      <button type="button" className="nav-slides__proximo" disabled={desabilitado} onClick={aoProximo}>
        <Icone nome="seta-dir" tamanho={38} />
        <span>Próximo</span>
      </button>
    </div>
  );
}
