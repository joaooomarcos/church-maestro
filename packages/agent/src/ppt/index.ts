import { platform } from 'node:os';
import { PPT_INDISPONIVEL, type PontePowerPoint } from './tipos.js';
import { criarPonteWindows } from './windows.js';

export * from './tipos.js';

/**
 * Fora do Windows não há PowerPoint: o Note Som roda Linux e o
 * desenvolvimento acontece no Mac. Nesses casos a ponte existe, porém inerte,
 * e as rotas /ppt respondem 501 em vez de quebrar o agente inteiro.
 */
const PONTE_INERTE: PontePowerPoint = {
  disponivel: false,
  async status() {
    return PPT_INDISPONIVEL;
  },
  async executar() {
    return PPT_INDISPONIVEL;
  },
  async janelaEmPrimeiroPlano() {
    return null;
  },
  async encerrar() {
    /* nada a encerrar */
  },
};

export function criarPontePowerPoint(): PontePowerPoint {
  return platform() === 'win32' ? criarPonteWindows() : PONTE_INERTE;
}
