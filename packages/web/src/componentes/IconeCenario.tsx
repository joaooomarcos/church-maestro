import { Icone, type NomeIcone } from './Icone';

/** Ícones que o editor oferece para um cenário. */
export const ICONES_CENARIO: NomeIcone[] = [
  'play',
  'relogio',
  'sino',
  'musica',
  'lua',
  'raio',
  'camera',
  'transmitir',
  'ndi',
  'holyrics',
  'powerpoint',
];

/** Cenários antigos guardam emoji; os mais comuns viram o ícone equivalente. */
const EMOJI_PARA_ICONE: Record<string, NomeIcone> = {
  '🕐': 'relogio',
  '🕒': 'relogio',
  '⏰': 'relogio',
  '🔔': 'sino',
  '🎵': 'musica',
  '🎶': 'musica',
  '🎤': 'musica',
  '🌙': 'lua',
  '🌚': 'lua',
  '📺': 'ndi',
  '📖': 'holyrics',
  '📊': 'powerpoint',
  '🎥': 'camera',
  '📹': 'camera',
  '▶': 'play',
  '▶️': 'play',
};

/** Nome do ícone desenhado para o que está salvo (nome ou emoji antigo). */
export function nomeDoIconeCenario(icone: string | undefined): NomeIcone | undefined {
  if (!icone) return 'play';
  if ((ICONES_CENARIO as string[]).includes(icone)) return icone as NomeIcone;
  return EMOJI_PARA_ICONE[icone];
}

export function IconeCenario({ icone, tamanho = 24 }: { icone?: string | undefined; tamanho?: number }) {
  const nome = nomeDoIconeCenario(icone);
  if (nome) return <Icone nome={nome} tamanho={tamanho} />;
  return <span className="icone-cenario__texto">{icone}</span>;
}
