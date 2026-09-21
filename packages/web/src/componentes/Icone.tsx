import type { JSX } from 'react';

/**
 * Ícones desenhados aqui mesmo, em SVG inline. Emoji muda de desenho conforme o
 * aparelho (e alguns nem aparecem em TV/datashow antigo); traço próprio garante
 * que o painel tenha a mesma cara no celular de cada pessoa da equipe.
 *
 * Todos em grade de 24, traço em `currentColor`, para herdarem a cor de quem os
 * usa — inclusive o estado da aba ativa e as cores de sucesso/erro dos testes.
 */
export type NomeIcone =
  | 'painel'
  | 'ndi'
  | 'holyrics'
  | 'powerpoint'
  | 'testes'
  | 'sistema'
  | 'ok'
  | 'falha'
  | 'aviso'
  | 'pulado'
  | 'seta-esquerda'
  | 'seta-direita'
  | 'play'
  | 'relogio'
  | 'musica'
  | 'lua'
  | 'camera';

const CAMINHOS: Record<NomeIcone, JSX.Element> = {
  painel: (
    <>
      <path d="M3.5 11.5 12 4l8.5 7.5" />
      <path d="M6 10.2V20h12v-9.8" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  ndi: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M12 16.5V20" />
      <path d="M8 20h8" />
    </>
  ),
  holyrics: (
    <>
      <path d="M12 6.5C10 5 7.5 4.5 5 4.5v13c2.5 0 5 .5 7 2" />
      <path d="M12 6.5c2-1.5 4.5-2 7-2v13c-2.5 0-5 .5-7 2" />
      <path d="M12 6.5v13" />
    </>
  ),
  powerpoint: (
    <>
      <rect x="3" y="4" width="18" height="11.5" rx="1.8" />
      <path d="M12 15.5V19" />
      <path d="M8.5 19h7" />
      <path d="M8 12V9.8M12 12V7.6M16 12v-3" />
    </>
  ),
  testes: (
    <>
      <path d="M9.5 3v6L5 16.8A2 2 0 0 0 6.7 20h10.6a2 2 0 0 0 1.7-3.2L14.5 9V3" />
      <path d="M8 3h8" />
      <path d="M7.4 14.5h9.2" />
    </>
  ),
  sistema: (
    <>
      <path d="M4 7h7M15 7h5M4 12h11M19 12h1M4 17h3M11 17h9" />
      <circle cx="13" cy="7" r="2" />
      <circle cx="17" cy="12" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  ok: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.4l2.6 2.6 5-5.4" />
    </>
  ),
  falha: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
    </>
  ),
  aviso: (
    <>
      <path d="M12 4.2 21 19.4H3z" />
      <path d="M12 10v4" />
      <path d="M12 16.8h.01" />
    </>
  ),
  pulado: (
    <>
      <path d="M6 6.5v11l8-5.5z" />
      <path d="M17.5 6.5v11" />
    </>
  ),
  'seta-esquerda': <path d="M15 4.8 7.8 12l7.2 7.2" />,
  'seta-direita': <path d="M9 4.8 16.2 12 9 19.2" />,
  play: <path d="M8 5.6v12.8L18.4 12z" />,
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.2 2.2" />
    </>
  ),
  musica: (
    <>
      <path d="M9.5 18V6.6l9-1.8V16" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="16" cy="16" r="2.5" />
    </>
  ),
  lua: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z" />,
  camera: (
    <>
      <rect x="3.5" y="7.5" width="11" height="9" rx="1.5" />
      <path d="M14.5 11l6-3v8l-6-3z" />
    </>
  ),
};

export function Icone({ nome, tamanho = 22 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      className={`icone icone--${nome}`}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
