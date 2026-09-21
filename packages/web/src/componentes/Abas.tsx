import { Icone, type NomeIcone } from './Icone';

export type AbaId = 'painel' | 'ndi' | 'holyrics' | 'powerpoint' | 'testes' | 'versoes';

const ABAS: ReadonlyArray<{ id: AbaId; rotulo: string; icone: NomeIcone }> = [
  { id: 'painel', rotulo: 'Painel', icone: 'painel' },
  { id: 'ndi', rotulo: 'NDI', icone: 'ndi' },
  { id: 'holyrics', rotulo: 'Holyrics', icone: 'holyrics' },
  { id: 'powerpoint', rotulo: 'PowerPoint', icone: 'powerpoint' },
  { id: 'testes', rotulo: 'Testes', icone: 'testes' },
  { id: 'versoes', rotulo: 'Sistema', icone: 'sistema' },
];

export function Abas({ atual, aoSelecionar }: { atual: AbaId; aoSelecionar: (aba: AbaId) => void }) {
  return (
    <nav className="abas">
      {ABAS.map((aba) => (
        <button
          key={aba.id}
          type="button"
          className={`abas__item${aba.id === atual ? ' abas__item--ativo' : ''}`}
          aria-current={aba.id === atual ? 'page' : undefined}
          onClick={() => aoSelecionar(aba.id)}
        >
          <span className="abas__icone">
            <Icone nome={aba.icone} />
          </span>
          <span className="abas__rotulo">{aba.rotulo}</span>
        </button>
      ))}
    </nav>
  );
}
