export type AbaId = 'painel' | 'ndi' | 'holyrics' | 'powerpoint' | 'testes' | 'versoes';

const ABAS: ReadonlyArray<{ id: AbaId; rotulo: string; icone: string }> = [
  { id: 'painel', rotulo: 'Painel', icone: '🏠' },
  { id: 'ndi', rotulo: 'NDI', icone: '📺' },
  { id: 'holyrics', rotulo: 'Holyrics', icone: '📖' },
  { id: 'powerpoint', rotulo: 'PowerPoint', icone: '📊' },
  { id: 'testes', rotulo: 'Testes', icone: '🧪' },
  { id: 'versoes', rotulo: 'Versões', icone: '⬆️' },
];

export function Abas({ atual, aoSelecionar }: { atual: AbaId; aoSelecionar: (aba: AbaId) => void }) {
  return (
    <nav className="abas">
      {ABAS.map((aba) => (
        <button
          key={aba.id}
          type="button"
          className={`abas__item${aba.id === atual ? ' abas__item--ativo' : ''}`}
          onClick={() => aoSelecionar(aba.id)}
        >
          <span className="abas__icone" aria-hidden="true">
            {aba.icone}
          </span>
          <span className="abas__rotulo">{aba.rotulo}</span>
        </button>
      ))}
    </nav>
  );
}
