import { ALTURA_AMOSTRA, LARGURA_AMOSTRA } from '@maestro/shared';

/**
 * Comparação de duas telas a partir da amostra em cinza (64×36) que o agente
 * devolve. Não é reconhecimento de imagem: só diz se as duas telas têm a mesma
 * "cara" (manchas claras e escuras nos mesmos lugares).
 *
 * TODOS os limites abaixo foram estimados no papel — CALIBRAR NA IGREJA com
 * prints reais: uma tela parecida (Screen Capture x Studio Monitor no telão)
 * deve passar com folga e duas telas diferentes devem cair claramente abaixo.
 */
export const LIMITES_IMAGEM = {
  /**
   * Desvio padrão (0–255) abaixo do qual a imagem é considerada lisa: tela
   * preta, apagada ou bloqueada. Aí a comparação não prova nada (inconclusivo).
   */
  desvioMinimo: 6,
  /**
   * Correlação de Pearson mínima (−1 a 1) para "parecidas". A janela do
   * Studio Monitor pode ter barra de título e faixas pretas, então não exigimos 1.
   */
  correlacaoMinima: 0.6,
  /**
   * Diferença média máxima (0–1) entre as imagens depois de normalizar o
   * contraste de cada uma. Duas telas sem relação ficam acima de ~0,3.
   */
  diferencaMaxima: 0.25,
} as const;

export type Amostra = Uint8Array | number[];

export interface ResultadoComparacao {
  veredito: 'parecidas' | 'diferentes' | 'inconclusiva';
  /** Qual lado estava liso (só quando inconclusiva). */
  lisa: 'origem' | 'destino' | 'ambas' | null;
  correlacao: number;
  diferenca: number;
  desvioOrigem: number;
  desvioDestino: number;
}

/** Decodifica a amostra em base64; null se o tamanho não bate com 64×36. */
export function decodificarAmostra(base64: string): Uint8Array | null {
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  return bytes.length === LARGURA_AMOSTRA * ALTURA_AMOSTRA ? bytes : null;
}

function media(valores: Amostra): number {
  let soma = 0;
  for (const v of valores) soma += v;
  return soma / valores.length;
}

export function desvioPadrao(valores: Amostra): number {
  const m = media(valores);
  let soma = 0;
  for (const v of valores) soma += (v - m) ** 2;
  return Math.sqrt(soma / valores.length);
}

function correlacao(a: Amostra, b: Amostra): number {
  const ma = media(a);
  const mb = media(b);
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = (a[i] as number) - ma;
    const db = (b[i] as number) - mb;
    ab += da * db;
    aa += da * da;
    bb += db * db;
  }
  return aa === 0 || bb === 0 ? 0 : ab / Math.sqrt(aa * bb);
}

/** Estica o contraste para 0–1 usando os percentis 2 e 98 (ignora pixels isolados). */
function normalizarContraste(valores: Amostra): number[] {
  const ordenados = [...valores].sort((x, y) => x - y);
  const baixo = ordenados[Math.floor(ordenados.length * 0.02)] as number;
  const alto = ordenados[Math.ceil(ordenados.length * 0.98) - 1] as number;
  const faixa = Math.max(1, alto - baixo);
  return Array.from(valores, (v) => Math.min(1, Math.max(0, (v - baixo) / faixa)));
}

function diferencaMedia(a: Amostra, b: Amostra): number {
  const na = normalizarContraste(a);
  const nb = normalizarContraste(b);
  let soma = 0;
  for (let i = 0; i < na.length; i++) soma += Math.abs((na[i] as number) - (nb[i] as number));
  return soma / na.length;
}

export function compararAmostras(origem: Amostra, destino: Amostra): ResultadoComparacao {
  const desvioOrigem = desvioPadrao(origem);
  const desvioDestino = desvioPadrao(destino);
  const lisaOrigem = desvioOrigem < LIMITES_IMAGEM.desvioMinimo;
  const lisaDestino = desvioDestino < LIMITES_IMAGEM.desvioMinimo;
  const r = correlacao(origem, destino);
  const d = diferencaMedia(origem, destino);

  if (lisaOrigem || lisaDestino) {
    return {
      veredito: 'inconclusiva',
      lisa: lisaOrigem && lisaDestino ? 'ambas' : lisaOrigem ? 'origem' : 'destino',
      correlacao: r,
      diferenca: d,
      desvioOrigem,
      desvioDestino,
    };
  }

  const parecidas = r >= LIMITES_IMAGEM.correlacaoMinima && d <= LIMITES_IMAGEM.diferencaMaxima;
  return {
    veredito: parecidas ? 'parecidas' : 'diferentes',
    lisa: null,
    correlacao: r,
    diferenca: d,
    desvioOrigem,
    desvioDestino,
  };
}
