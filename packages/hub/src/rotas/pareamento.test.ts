import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { dispositivoConfigSchema, type DispositivoConfig } from '@maestro/shared';
import { escolherId, servicosDoPareamento } from './pareamento.js';
import { criarContexto } from './contexto.js';
import { Store } from '../estado/store.js';
import type { Drivers } from '../drivers/tipos.js';

function dispositivo(id: string, host: string): DispositivoConfig {
  return dispositivoConfigSchema.parse({ id, nome: id, host, servicos: { agente: { porta: 8770 } } });
}

function ctxCom(dispositivos: DispositivoConfig[]): { obterDispositivo: (id: string) => DispositivoConfig | undefined } {
  return { obterDispositivo: (id) => dispositivos.find((d) => d.id === id) };
}

/**
 * O id sai do nome que a pessoa digita no assistente, então duas máquinas com o
 * mesmo nome são questão de tempo — e sobrescrever o cadastro da outra deixaria
 * uma delas invisível no painel, sem erro nenhum.
 */
describe('escolherId', () => {
  it('usa o slug do nome quando ninguém ocupa', () => {
    expect(escolherId(ctxCom([]), 'PC Transmissão', '192.168.0.10', undefined)).toBe('pc-transmissao');
  });

  it('reaproveita o id quando é a mesma máquina pareando de novo', () => {
    const existentes = [dispositivo('note-frente', '192.168.0.11')];
    expect(escolherId(ctxCom(existentes), 'Note Frente', '192.168.0.11', undefined)).toBe('note-frente');
  });

  it('reaproveita o id quando a máquina mudou de IP mas informou o id anterior', () => {
    const existentes = [dispositivo('note-frente', '192.168.0.11')];
    expect(escolherId(ctxCom(existentes), 'Note Frente', '192.168.0.77', 'note-frente')).toBe('note-frente');
  });

  it('sufixa quando outra máquina já usa o nome', () => {
    const existentes = [dispositivo('note-frente', '192.168.0.11')];
    expect(escolherId(ctxCom(existentes), 'Note Frente', '192.168.0.12', undefined)).toBe('note-frente-2');
  });
});

async function contextoTemporario(dispositivos: DispositivoConfig[]) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'maestro-teste-'));
  const caminhoDispositivos = path.join(pasta, 'devices.json');
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
    cenarios: [],
    dispositivos,
    caminhoDispositivos,
    caminhoHub: path.join(pasta, 'hub.json'),
  });
  return { ctx, caminhoDispositivos };
}

describe('registrarDispositivo', () => {
  it('cadastra uma máquina nova e persiste em disco', async () => {
    const { ctx, caminhoDispositivos } = await contextoTemporario([]);

    await ctx.registrarDispositivo(dispositivo('pc-fundo', '192.168.0.25'));

    expect(ctx.dispositivos().map((d) => d.id)).toEqual(['pc-fundo']);
    const salvo = JSON.parse(await readFile(caminhoDispositivos, 'utf8')) as {
      dispositivos: DispositivoConfig[];
    };
    expect(salvo.dispositivos[0]?.host).toBe('192.168.0.25');
  });

  it('substitui o cadastro quando a mesma máquina pareia de novo', async () => {
    const { ctx } = await contextoTemporario([dispositivo('pc-fundo', '192.168.0.25')]);

    await ctx.registrarDispositivo(dispositivo('pc-fundo', '192.168.0.99'));

    expect(ctx.dispositivos()).toHaveLength(1);
    expect(ctx.dispositivos()[0]?.host).toBe('192.168.0.99');
  });

  it('renomear não deixa dois cadastros da mesma máquina', async () => {
    const { ctx } = await contextoTemporario([dispositivo('note-som', '192.168.0.30')]);

    await ctx.registrarDispositivo(dispositivo('note-som-novo', '192.168.0.30'), 'note-som');

    expect(ctx.dispositivos().map((d) => d.id)).toEqual(['note-som-novo']);
  });
});

describe('servicosDoPareamento', () => {
  const legendas = {
    cena: 'Cena_Elementos',
    grupoMusica: 'Música',
    grupoLeitura: 'Leitura',
    holyrics: [{ dispositivo: 'note-frente', fonteMusica: 'holyrics1_musica' }],
    atualizarAoLigar: true,
    horariosProibidos: [],
    versiculo: 'Sl 23:1',
  };
  const existente = dispositivoConfigSchema.parse({
    id: 'pc-transmissao',
    nome: 'PC Transmissão',
    host: '192.168.0.20',
    servicos: { obs: { porta: 4455, legendas } },
  });

  it('mantém Ajustes › Legendas quando a máquina do OBS pareia de novo', () => {
    const servicos = servicosDoPareamento({ porta: 8770, servicos: { obs: { porta: 4455, senha: 'nova' } } }, existente);
    expect(servicos.obs).toEqual({ porta: 4455, senha: 'nova', legendas });
    expect(servicos.agente).toEqual({ porta: 8770 });
  });

  it('não inventa OBS quando o assistente diz que a máquina não tem mais', () => {
    const servicos = servicosDoPareamento({ porta: 8770, servicos: {} }, existente);
    expect(servicos.obs).toBeUndefined();
  });
});

describe('servicosDoPareamento (NDI)', () => {
  it('mantém o monitor de cada janela que continua existindo', () => {
    const existente = dispositivoConfigSchema.parse({
      id: 'pc-fundo',
      nome: 'PC Fundo',
      host: '192.168.0.22',
      servicos: { ndiMonitor: { portas: [80, 81], monitores: { '80': '\\\\.\\DISPLAY2', '81': '\\\\.\\DISPLAY1' } } },
    });
    const servicos = servicosDoPareamento({ porta: 8770, servicos: { ndiMonitor: { portas: [80] } } }, existente);
    expect(servicos.ndiMonitor).toEqual({ portas: [80], monitores: { '80': '\\\\.\\DISPLAY2' } });
  });
});
