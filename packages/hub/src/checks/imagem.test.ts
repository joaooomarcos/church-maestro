import { describe, it, expect } from 'vitest';
import { ALTURA_AMOSTRA, LARGURA_AMOSTRA } from '@maestro/shared';
import { compararAmostras, decodificarAmostra } from './imagem.js';

const TAMANHO = LARGURA_AMOSTRA * ALTURA_AMOSTRA;

/** Imagem de teste: fundo escuro com um retângulo claro nos limites dados. */
function imagem(retangulo: { x: number; y: number; l: number; a: number }, fundo = 30, tom = 220): Uint8Array {
  const dados = new Uint8Array(TAMANHO).fill(fundo);
  for (let y = retangulo.y; y < retangulo.y + retangulo.a; y++) {
    for (let x = retangulo.x; x < retangulo.x + retangulo.l; x++) dados[y * LARGURA_AMOSTRA + x] = tom;
  }
  return dados;
}

const ESQUERDA = { x: 4, y: 4, l: 24, a: 14 };
const DIREITA_BAIXO = { x: 36, y: 20, l: 24, a: 14 };

describe('compararAmostras', () => {
  it('imagens iguais são parecidas', () => {
    const r = compararAmostras(imagem(ESQUERDA), imagem(ESQUERDA));
    expect(r.veredito).toBe('parecidas');
    expect(r.correlacao).toBeCloseTo(1, 5);
    expect(r.diferenca).toBe(0);
  });

  it('ignora diferença de brilho e contraste entre as telas', () => {
    const r = compararAmostras(imagem(ESQUERDA, 30, 220), imagem(ESQUERDA, 70, 180));
    expect(r.veredito).toBe('parecidas');
  });

  it('imagens com a mancha em outro lugar são diferentes', () => {
    const r = compararAmostras(imagem(ESQUERDA), imagem(DIREITA_BAIXO));
    expect(r.veredito).toBe('diferentes');
    expect(r.correlacao).toBeLessThan(0.6);
  });

  it('tela preta na origem ou no destino é inconclusiva, não "diferente"', () => {
    const preta = new Uint8Array(TAMANHO);
    expect(compararAmostras(preta, imagem(ESQUERDA))).toMatchObject({ veredito: 'inconclusiva', lisa: 'origem' });
    expect(compararAmostras(imagem(ESQUERDA), preta)).toMatchObject({ veredito: 'inconclusiva', lisa: 'destino' });
    expect(compararAmostras(preta, preta)).toMatchObject({ veredito: 'inconclusiva', lisa: 'ambas' });
  });

  it('tela quase lisa (ruído mínimo) também é inconclusiva', () => {
    const quase = new Uint8Array(TAMANHO).fill(128);
    quase[10] = 130;
    expect(compararAmostras(quase, imagem(ESQUERDA)).veredito).toBe('inconclusiva');
  });
});

describe('decodificarAmostra', () => {
  it('aceita exatamente 64×36 bytes', () => {
    expect(decodificarAmostra(Buffer.from(new Uint8Array(TAMANHO)).toString('base64'))?.length).toBe(TAMANHO);
    expect(decodificarAmostra(Buffer.from([1, 2, 3]).toString('base64'))).toBeNull();
  });
});
