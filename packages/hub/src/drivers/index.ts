import type { Drivers } from './tipos.js';
import { criarDriverNdi } from './ndi.js';
import { criarDriverHolyrics } from './holyrics.js';
import { criarDriverObs } from './obs.js';
import { criarDriverAgente } from './agente.js';
import { criarDriversMock } from './mock.js';

export * from './tipos.js';

/**
 * Em modo mock nenhuma conexão de rede é aberta — é o que permite desenvolver
 * a interface inteira fora da igreja.
 */
export function criarDrivers(mock: boolean, tokenAgentes?: string): Drivers {
  if (mock) return criarDriversMock();
  return {
    ndi: criarDriverNdi(),
    holyrics: criarDriverHolyrics(),
    obs: criarDriverObs(),
    agente: criarDriverAgente(tokenAgentes),
  };
}
