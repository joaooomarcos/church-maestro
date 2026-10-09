import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutomacaoAoLigar, EstadoDispositivo } from '@maestro/shared';
import { criarGatilhoAoLigar, OFFLINE_MINIMO_MS } from './aoLigar.js';
import { historicoDe } from './historico.js';
import { criarContexto } from '../rotas/contexto.js';
import { Store } from '../estado/store.js';
import type { Drivers } from '../drivers/tipos.js';

const abrirHolyrics: AutomacaoAoLigar = {
  id: 'l1',
  tipo: 'aoLigar',
  dispositivo: 'note-frente',
  cenarioId: 'abrir',
  esperaSegundos: 30,
  ativo: true,
};

const estado = (online: boolean): EstadoDispositivo[] => [
  { id: 'note-frente', nome: 'Note Frente', host: '10.0.0.5', online, ultimoContato: null, apps: [], ndi: [] },
];

function montar(ativo = true) {
  const ctx = criarContexto({
    config: {
      porta: 8700,
      pin: '1234',
      segredoSessao: 'x'.repeat(16),
      tokenAgentes: 'y'.repeat(16),
      intervaloHeartbeatMs: 10_000,
      pinConvidado: '4321',
      intervaloPollingMs: 2000,
      varreduraAutomaticaMin: 10,
    },
    drivers: {} as Drivers,
    store: new Store(),
    cenarios: [{ id: 'abrir', nome: 'Abrir Holyrics', acoes: [{ tipo: 'espera', ms: 1 }] }],
    automacoes: { ativo, agendamentos: [abrirHolyrics] },
    dispositivos: [],
    caminhoDispositivos: '/nao-grava',
    caminhoHub: '/nao-grava',
    persistir: false,
  });
  return { ctx, gatilho: criarGatilhoAoLigar(ctx) };
}

describe('gatilho "quando ligar"', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 18, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('dispara depois da espera quando a máquina volta de um offline longo', async () => {
    const { ctx, gatilho } = montar();
    gatilho.processar(estado(true)); // ponto de partida
    gatilho.processar(estado(false));
    await vi.advanceTimersByTimeAsync(OFFLINE_MINIMO_MS + 1000);
    gatilho.processar(estado(true));

    await vi.advanceTimersByTimeAsync(29_000);
    expect(historicoDe(ctx)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(historicoDe(ctx)).toHaveLength(1);
    expect(historicoDe(ctx)[0]).toMatchObject({ origem: 'aoLigar', agendamentoId: 'l1', ok: true });
  });

  it('a primeira leitura não dispara, nem online nem offline→online logo em seguida', async () => {
    const { ctx, gatilho } = montar();
    gatilho.processar(estado(true));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(historicoDe(ctx)).toHaveLength(0);

    const outro = montar();
    outro.gatilho.processar(estado(false));
    await vi.advanceTimersByTimeAsync(10_000);
    outro.gatilho.processar(estado(true));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(historicoDe(outro.ctx)).toHaveLength(0);
  });

  it('oscilação curta (menos de 60 s offline) não conta como ligar', async () => {
    const { ctx, gatilho } = montar();
    gatilho.processar(estado(true));
    gatilho.processar(estado(false));
    await vi.advanceTimersByTimeAsync(20_000);
    gatilho.processar(estado(true));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(historicoDe(ctx)).toHaveLength(0);
  });

  it('cancela se a máquina cair durante a espera', async () => {
    const { ctx, gatilho } = montar();
    gatilho.processar(estado(true));
    gatilho.processar(estado(false));
    await vi.advanceTimersByTimeAsync(OFFLINE_MINIMO_MS + 1000);
    gatilho.processar(estado(true));
    await vi.advanceTimersByTimeAsync(10_000);
    gatilho.processar(estado(false));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(historicoDe(ctx)).toHaveLength(0);
  });

  it('com as automações desligadas, não dispara', async () => {
    const { ctx, gatilho } = montar(false);
    gatilho.processar(estado(true));
    gatilho.processar(estado(false));
    await vi.advanceTimersByTimeAsync(OFFLINE_MINIMO_MS + 1000);
    gatilho.processar(estado(true));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(historicoDe(ctx)).toHaveLength(0);
  });

  it('desligar o interruptor durante a espera também cancela', async () => {
    const { ctx, gatilho } = montar();
    gatilho.processar(estado(true));
    gatilho.processar(estado(false));
    await vi.advanceTimersByTimeAsync(OFFLINE_MINIMO_MS + 1000);
    gatilho.processar(estado(true));
    await ctx.salvarAutomacoes({ ...ctx.automacoes(), ativo: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(historicoDe(ctx)).toHaveLength(0);
  });
});
