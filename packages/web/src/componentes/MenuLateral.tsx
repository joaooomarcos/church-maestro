import { Icone, type NomeIcone } from './Icone';

export type TelaId =
  | 'painel'
  | 'ndi'
  | 'holyrics'
  | 'powerpoint'
  | 'testes'
  | 'avisos'
  | 'cenarios'
  | 'agendamentos'
  | 'convidado'
  | 'compartilhar'
  | 'versoes'
  | 'ajustes';

interface ItemMenu {
  id: TelaId;
  rotulo: string;
  icone: NomeIcone;
}

/** Agrupado pelo que a pessoa quer fazer, não por onde a coisa mora no código. */
const GRUPOS: ReadonlyArray<{ titulo: string; itens: ItemMenu[] }> = [
  {
    titulo: 'Operação',
    itens: [
      { id: 'painel', rotulo: 'Painel', icone: 'painel' },
      { id: 'ndi', rotulo: 'NDI', icone: 'ndi' },
      { id: 'holyrics', rotulo: 'Holyrics', icone: 'holyrics' },
      { id: 'powerpoint', rotulo: 'PowerPoint', icone: 'powerpoint' },
      { id: 'avisos', rotulo: 'Avisos', icone: 'sino' },
      { id: 'testes', rotulo: 'Testes', icone: 'testes' },
    ],
  },
  {
    titulo: 'Automação',
    itens: [
      { id: 'cenarios', rotulo: 'Cenários', icone: 'raio' },
      { id: 'agendamentos', rotulo: 'Agendamentos', icone: 'relogio' },
    ],
  },
  {
    titulo: 'Compartilhar',
    itens: [
      { id: 'convidado', rotulo: 'Slides do convidado', icone: 'qr' },
      { id: 'compartilhar', rotulo: 'Links e arquivos', icone: 'compartilhar' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { id: 'versoes', rotulo: 'Versões', icone: 'atualizar' },
      { id: 'ajustes', rotulo: 'Ajustes', icone: 'sistema' },
    ],
  },
];

const TODAS = GRUPOS.flatMap((grupo) => grupo.itens);

export function ehTela(valor: string | null): valor is TelaId {
  return TODAS.some((item) => item.id === valor);
}

export function tituloDaTela(id: TelaId): string {
  return TODAS.find((item) => item.id === id)?.rotulo ?? '';
}

/**
 * No celular fica escondido e abre por cima da tela pelo botão ☰; no
 * computador fica sempre à esquerda (o CSS decide pela largura).
 */
export function MenuLateral({
  atual,
  aberto,
  aoSelecionar,
  aoFechar,
}: {
  atual: TelaId;
  aberto: boolean;
  aoSelecionar: (tela: TelaId) => void;
  aoFechar: () => void;
}) {
  return (
    <>
      <div
        className={`menu-lateral__fundo${aberto ? ' menu-lateral__fundo--visivel' : ''}`}
        onClick={aoFechar}
        aria-hidden="true"
      />
      <nav className={`menu-lateral${aberto ? ' menu-lateral--aberto' : ''}`} aria-label="Menu principal">
        <div className="menu-lateral__topo">
          <span className="menu-lateral__marca">Maestro</span>
          <button type="button" className="menu-lateral__fechar" onClick={aoFechar} aria-label="Fechar menu">
            <Icone nome="fechar" />
          </button>
        </div>
        {GRUPOS.map((grupo) => (
          <div key={grupo.titulo} className="menu-lateral__grupo">
            <p className="menu-lateral__titulo">{grupo.titulo}</p>
            {grupo.itens.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`menu-lateral__item${item.id === atual ? ' menu-lateral__item--ativo' : ''}`}
                aria-current={item.id === atual ? 'page' : undefined}
                onClick={() => aoSelecionar(item.id)}
              >
                <Icone nome={item.icone} tamanho={20} />
                <span>{item.rotulo}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
    </>
  );
}
