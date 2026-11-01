import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import type { EstadoObs, GatilhoObs, MensagemHub } from '@maestro/shared';
import { arquivoAutomacoesSchema } from '@maestro/shared';
import { condicaoAtendida, criarMonitorObs } from './gatilhoObs.js';
import { historicoDe } from './historico.js';
import { criarContexto } from '../rotas/contexto.js';
import { Store } from '../estado/store.js';
import type { Drivers } from '../drivers/tipos.js';

// 2026-09-27 é um domingo.
const domingo = (hora: number, minuto: number, segundo = 0): Date => new Date(2026, 8, 27, hora, minuto, segundo);

const gatilho: GatilhoObs = {
  id: 'g1',
  tipo: 'obs',
  cenarioId: 'inicio',
  dispositivo: 'pc-transmissao',
  cena: 'Culto',
  dias: [0],
  aPartirDe: '18:50',
  esperaSegundos: 90,
  ativo: true,
};

function obs(extra: Partial<EstadoObs> = {}): EstadoObs {
  return {
    online: true,
    erro: null,
    cenaAtual: 'Culto',
    cenas: ['Abertura', 'Culto'],
    transmitindo: true,
    gravando: false,
    tempoTransmissaoS: 0,
    bitrateKbps: 0,
    framesPerdidos: 0,
    percFramesPerdidos: 0,
    ...extra,
  };
}

async function montar(opcoes: { gatilhos?: GatilhoObs[]; ativo?: boolean; caminhoMarcas?: string } = {}) {
  let agora = domingo(19, 0);
  const store = new Store();
  const avisos: string[] = [];
  vi.spyOn(store, 'transmitirMensagem').mockImplementation((mensagem: MensagemHub) => {
    if (mensagem.tipo === 'aviso') avisos.push(mensagem.texto);
  });
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
    store,
    cenarios: [{ id: 'inicio', nome: 'Início', acoes: [{ tipo: 'espera', ms: 1 }] }],
    automacoes: { ativo: opcoes.ativo ?? true, agendamentos: opcoes.gatilhos ?? [gatilho] },
    dispositivos: [],
    caminhoDispositivos: '/nao-grava',
    caminhoHub: '/nao-grava',
    persistir: false,
  });
  const caminhoMarcas =
    opcoes.caminhoMarcas ?? path.join(await mkdtemp(path.join(tmpdir(), 'maestro-gatilho-')), 'gatilhos-obs.json');
  const monitor = criarMonitorObs(ctx, { caminhoMarcas, relogio: () => agora });
  await monitor.carregar();

  const mudarObs = (estado: EstadoObs | undefined): void => {
    store.atualizarDispositivos([
      {
        id: 'pc-transmissao',
        nome: 'PC Transmissão',
        host: '127.0.0.1',
        online: true,
        ultimoContato: null,
        ndi: [],
        ...(estado ? { obs: estado } : {}),
      },
    ]);
  };
  mudarObs(obs());

  return {
    ctx,
    monitor,
    avisos,
    caminhoMarcas,
    mudarObs,
    irPara: (data: Date) => {
      agora = data;
    },
    execucoes: () => historicoDe(ctx).length,
  };
}

describe('condicaoAtendida', () => {
  it('vale com a cena no ar, transmitindo, no dia e a partir da hora', () => {
    expect(condicaoAtendida(gatilho, obs(), domingo(18, 50))).toBe(true);
  });

  it('não vale antes da hora, em outro dia ou com o gatilho desligado', () => {
    expect(condicaoAtendida(gatilho, obs(), domingo(18, 49, 59))).toBe(false);
    expect(condicaoAtendida(gatilho, obs(), new Date(2026, 8, 28, 19, 0))).toBe(false);
    expect(condicaoAtendida({ ...gatilho, ativo: false }, obs(), domingo(19, 0))).toBe(false);
  });

  it('não vale em outra cena nem sem transmitir', () => {
    expect(condicaoAtendida(gatilho, obs({ cenaAtual: 'Abertura' }), domingo(19, 0))).toBe(false);
    expect(condicaoAtendida(gatilho, obs({ transmitindo: false }), domingo(19, 0))).toBe(false);
  });

  it('não vale sem leitura do OBS', () => {
    expect(condicaoAtendida(gatilho, undefined, domingo(19, 0))).toBe(false);
    expect(condicaoAtendida(gatilho, obs({ online: false }), domingo(19, 0))).toBe(false);
  });
});

describe('arquivoAutomacoesSchema', () => {
  it('lê juntos o agendamento antigo sem `tipo` e o gatilho do OBS', () => {
    const lido = arquivoAutomacoesSchema.parse({
      agendamentos: [{ id: 'a1', cenarioId: 'x', dias: [0], hora: '18:50' }, gatilho],
    });
    expect(lido.agendamentos.map((a) => a.tipo)).toEqual([undefined, 'obs']);
  });

  it('recusa gatilho sem cena', () => {
    expect(arquivoAutomacoesSchema.safeParse({ agendamentos: [{ ...gatilho, cena: '' }] }).success).toBe(false);
  });
});

describe('criarMonitorObs', () => {
  it('avisa, espera o tempo marcado e roda uma vez só', async () => {
    const m = await montar();
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(0);
    expect(m.avisos[0]).toContain('"Início" roda em 90 s');

    m.irPara(domingo(19, 1, 29));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(0);

    m.irPara(domingo(19, 1, 30));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
    expect(historicoDe(m.ctx)[0]?.origem).toBe('obs');
    expect(historicoDe(m.ctx)[0]?.agendamentoId).toBe('g1');

    m.irPara(domingo(19, 10));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
  });

  it('com espera zero roda na hora', async () => {
    const m = await montar({ gatilhos: [{ ...gatilho, esperaSegundos: 0 }] });
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
  });

  it('cena que entrou antes da hora começa a contar quando a hora chega', async () => {
    const m = await montar();
    m.irPara(domingo(18, 40));
    await m.monitor.verificar();
    expect(m.avisos).toHaveLength(0);

    m.irPara(domingo(18, 50));
    await m.monitor.verificar();
    m.irPara(domingo(18, 51, 30));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
  });

  it('trocar de cena durante a espera não cancela', async () => {
    const m = await montar();
    await m.monitor.verificar();
    m.mudarObs(obs({ cenaAtual: 'Abertura' }));
    m.irPara(domingo(19, 2));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
  });

  it('parar a transmissão durante a espera cancela, e pode contar de novo depois', async () => {
    const m = await montar();
    await m.monitor.verificar();
    m.mudarObs(obs({ transmitindo: false }));
    m.irPara(domingo(19, 0, 30));
    await m.monitor.verificar();
    expect(m.avisos.at(-1)).toContain('não vai rodar');

    m.mudarObs(obs());
    m.irPara(domingo(19, 5));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(0);
    m.irPara(domingo(19, 6, 30));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
  });

  it('uma leitura falha do OBS não cancela nem dispara; decide quando ele voltar', async () => {
    const m = await montar();
    await m.monitor.verificar();
    m.mudarObs(obs({ online: false, transmitindo: false, cenaAtual: null }));
    m.irPara(domingo(19, 2));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(0);
    expect(m.avisos).toHaveLength(1);

    m.mudarObs(obs());
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
  });

  it('desligar a automação durante a espera cancela', async () => {
    const m = await montar();
    await m.monitor.verificar();
    await m.ctx.salvarAutomacoes({ ...m.ctx.automacoes(), ativo: false });
    m.irPara(domingo(19, 2));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(0);
  });

  it('não roda com as automações desligadas', async () => {
    const m = await montar({ ativo: false });
    await m.monitor.verificar();
    expect(m.avisos).toHaveLength(0);
  });

  it('hub reiniciado no mesmo dia não roda de novo', async () => {
    const m = await montar();
    await m.monitor.verificar();
    m.irPara(domingo(19, 2));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);

    const reiniciado = await montar({ caminhoMarcas: m.caminhoMarcas });
    reiniciado.irPara(domingo(19, 3));
    await reiniciado.monitor.verificar();
    reiniciado.irPara(domingo(19, 6));
    await reiniciado.monitor.verificar();
    expect(reiniciado.execucoes()).toBe(0);
  });

  it('volta a rodar no domingo seguinte', async () => {
    const m = await montar();
    await m.monitor.verificar();
    m.irPara(domingo(19, 2));
    await m.monitor.verificar();

    m.irPara(new Date(2026, 9, 4, 19, 0));
    await m.monitor.verificar();
    m.irPara(new Date(2026, 9, 4, 19, 2));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(2);
  });

  it('arquivo de marcas estragado vale como vazio, e a marca é gravada', async () => {
    const pasta = await mkdtemp(path.join(tmpdir(), 'maestro-gatilho-'));
    const caminhoMarcas = path.join(pasta, 'gatilhos-obs.json');
    await writeFile(caminhoMarcas, 'isto não é json');
    const m = await montar({ caminhoMarcas });
    await m.monitor.verificar();
    m.irPara(domingo(19, 2));
    await m.monitor.verificar();
    expect(m.execucoes()).toBe(1);
    expect(JSON.parse(await readFile(caminhoMarcas, 'utf8'))).toEqual({ g1: '2026-9-27' });
  });
});
