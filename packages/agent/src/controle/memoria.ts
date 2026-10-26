import { randomInt } from 'node:crypto';
import type { ConfigAgente } from '@maestro/shared';
import { carregarConfigSeExistir, salvarConfig } from '../config.js';

/**
 * O que o modo solo precisa guardar em config/agent.json: o PIN dele e o que o
 * hub informou da última vez (nome, janelas de NDI, token do Holyrics). Assim o
 * controle funciona mesmo que o agente reinicie com o hub desligado.
 */

export type MemoriaHub = NonNullable<ConfigAgente['memoriaHub']>;

export interface Memoria {
  pinSolo(): string;
  trocarPinSolo(): Promise<string>;
  hub(): MemoriaHub | undefined;
  /** Grava só quando muda: o hub é lido a cada 10 s. */
  lembrarHub(dados: MemoriaHub): Promise<void>;
}

function sortearPin(): string {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

/** `gravar` existe para os testes não mexerem no config/agent.json de verdade. */
export function criarMemoria(
  config: ConfigAgente,
  gravar: (mudanca: Partial<ConfigAgente>) => Promise<void> = gravarNoArquivo,
): Memoria {
  let pin = config.pinSolo;
  let hub = config.memoriaHub;
  let pinGravado = Boolean(pin);

  return {
    pinSolo() {
      if (!pin) pin = sortearPin();
      if (!pinGravado) {
        pinGravado = true;
        const novo = pin;
        // O PIN não pode mudar no próximo reinício: grava assim que nasce.
        void gravar({ pinSolo: novo }).catch(() => {
          pinGravado = false;
        });
      }
      return pin;
    },

    async trocarPinSolo() {
      pin = sortearPin();
      pinGravado = true;
      await gravar({ pinSolo: pin });
      return pin;
    },

    hub: () => hub,

    async lembrarHub(dados) {
      if (JSON.stringify(dados) === JSON.stringify(hub)) return;
      hub = dados;
      await gravar({ memoriaHub: dados });
    },
  };
}

async function gravarNoArquivo(mudanca: Partial<ConfigAgente>): Promise<void> {
  // Relê o arquivo: o "Manter ligado" também grava nele e não pode ser desfeito.
  const atual = await carregarConfigSeExistir();
  if (!atual) return;
  await salvarConfig({ ...atual, ...mudanca });
}
