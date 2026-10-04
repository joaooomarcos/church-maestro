import { describe, it, expect } from 'vitest';
import { broadcastDaRede, montarPacoteMagico } from './acordar.js';

describe('montarPacoteMagico', () => {
  it('monta 6 bytes 0xFF seguidos do MAC repetido 16 vezes', () => {
    const pacote = montarPacoteMagico('aa:bb:cc:dd:ee:01');
    expect(pacote).not.toBeNull();
    expect(pacote?.length).toBe(102);
    expect([...(pacote?.subarray(0, 6) ?? [])]).toEqual([255, 255, 255, 255, 255, 255]);
    expect([...(pacote?.subarray(6, 12) ?? [])]).toEqual([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
    expect([...(pacote?.subarray(96, 102) ?? [])]).toEqual([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0x01]);
  });

  it('aceita hífen e recusa MAC inválido', () => {
    expect(montarPacoteMagico('AA-BB-CC-DD-EE-01')).not.toBeNull();
    expect(montarPacoteMagico('aa:bb:cc')).toBeNull();
    expect(montarPacoteMagico('zz:bb:cc:dd:ee:01')).toBeNull();
  });
});

describe('broadcastDaRede', () => {
  it('troca o último número por 255', () => {
    expect(broadcastDaRede('192.168.0.20')).toBe('192.168.0.255');
  });

  it('não inventa broadcast para endereço que não é IPv4', () => {
    expect(broadcastDaRede('pc-fundo.local')).toBeNull();
    expect(broadcastDaRede('')).toBeNull();
  });
});
