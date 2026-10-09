import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { arquivoConvidadosSchema } from '@maestro/shared';
import { criarContexto } from './rotas/contexto.js';
import { Store } from './estado/store.js';
import type { Drivers } from './drivers/tipos.js';
import { carregarOuCriarConvidados } from './config.js';
import { normalizarPinsConvidado } from './pinsConvidado.js';

const link = (id: string, pin: string) => ({
  id,
  nome: `Link ${id}`,
  token: id.repeat(16).slice(0, 16),
  dispositivo: 'note',
  modo: 'teclado' as const,
  completo: false,
  pin,
  versaoPin: 'versaoantiga1',
});

async function montar(pinConvidado: string, pins: string[]) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'maestro-pins-'));
  const ctx = criarContexto({
    config: {
      porta: 8700,
      pin: '1234',
      segredoSessao: 'x'.repeat(16),
      tokenAgentes: 'y'.repeat(16),
      intervaloHeartbeatMs: 10_000,
      pinConvidado,
      intervaloPollingMs: 2000,
      varreduraAutomaticaMin: 10,
    },
    drivers: {} as Drivers,
    store: new Store(),
    cenarios: [],
    dispositivos: [],
    convidados: arquivoConvidadosSchema.parse({ links: pins.map((p, i) => link(`a${i}`, p)) }),
    caminhoDispositivos: path.join(pasta, 'devices.json'),
    caminhoHub: path.join(pasta, 'hub.json'),
    caminhoConvidados: path.join(pasta, 'convidados.json'),
  });
  return { ctx, caminho: path.join(pasta, 'convidados.json') };
}

describe('normalizarPinsConvidado', () => {
  it('troca PIN antigo por 4 dígitos, renova a versão e avisa', async () => {
    const { ctx, caminho } = await montar('12345678', ['123456', '4821']);
    const log = { warn: vi.fn() };
    await normalizarPinsConvidado(ctx, log);

    expect(ctx.config.pinConvidado).toMatch(/^\d{4}$/);
    const [antigo, certo] = ctx.linksConvidado();
    expect(antigo?.pin).toMatch(/^\d{4}$/);
    expect(antigo?.versaoPin).not.toBe('versaoantiga1');
    expect(certo?.pin).toBe('4821');
    expect(certo?.versaoPin).toBe('versaoantiga1');
    expect(log.warn).toHaveBeenCalledTimes(2);
    const salvo = await carregarOuCriarConvidados(caminho);
    expect(salvo.links[0]?.pin).toMatch(/^\d{4}$/);
  });

  it('deixa intacto o que já tem 4 dígitos', async () => {
    const { ctx } = await montar('0042', ['9999']);
    const log = { warn: vi.fn() };
    await normalizarPinsConvidado(ctx, log);
    expect(ctx.config.pinConvidado).toBe('0042');
    expect(ctx.linksConvidado()[0]?.pin).toBe('9999');
    expect(ctx.linksConvidado()[0]?.versaoPin).toBe('versaoantiga1');
    expect(log.warn).not.toHaveBeenCalled();
  });
});
