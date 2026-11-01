import { describe, it, expect, vi } from 'vitest';
import type { Verificacao } from '@maestro/shared';
import { criarAgendador } from './agendador.js';
import { criarContexto } from '../rotas/contexto.js';
import { Store } from '../estado/store.js';
import { ErroDriver, type Drivers } from '../drivers/tipos.js';

// 2026-09-27 é um domingo.
const domingo = (hora: number, minuto: number, segundo = 0): Date => new Date(2026, 8, 27, hora, minuto, segundo);

const verifObs: Verificacao = {
  id: 'v1', tipo: 'verificacao', cenarioId: 'socorro', condicao: 'obsSemTransmitir',
  dispositivo: 'pc', dias: [0], hora: '18:55', ativo: true,
};
const verifYoutube: Verificacao = { ...verifObs, id: 'v2', condicao: 'youtubeSemLive', dispositivo: undefined };

function montar(verificacao: Verificacao, obs: { online: boolean; transmitindo: boolean } | undefined, youtube: () => Promise<boolean>, comChave = true) {
  const store = new Store();
  if (obs) {
    store.atualizarDispositivos([{ id: 'pc', obs: { ...obs } } as never]);
  }
  const avisos: { nivel: string; texto: string }[] = [];
  vi.spyOn(store, 'transmitirMensagem').mockImplementation(((m: { nivel: string; texto: string }) => {
    avisos.push(m);
  }) as never);
  const aoVivo = vi.fn(youtube);
  const ctx = criarContexto({
    config: {
      porta: 8700, pin: '1234', segredoSessao: 'x'.repeat(16), tokenAgentes: 'y'.repeat(16),
      intervaloHeartbeatMs: 10_000, pinConvidado: '4321', intervaloPollingMs: 2000, varreduraAutomaticaMin: 10,
      ...(comChave ? { youtubeCanalId: 'UCabcdefghijklmnopqrstuv', youtubeChaveApi: 'chave' } : {}),
    },
    drivers: { youtube: { aoVivo } } as unknown as Drivers,
    store,
    cenarios: [{ id: 'socorro', nome: 'Socorro', acoes: [{ tipo: 'espera', ms: 1 }] }],
    automacoes: { ativo: true, agendamentos: [verificacao] },
    dispositivos: [],
    caminhoDispositivos: '/nao-grava',
    caminhoHub: '/nao-grava',
    persistir: false,
  });
  let agora = domingo(18, 55, 5);
  const agendador = criarAgendador(ctx, () => agora);
  return { agendador, avisos, aoVivo, avancar: (d: Date) => (agora = d) };
}

describe('verificação: OBS sem transmitir', () => {
  it('não roda se o OBS está transmitindo', async () => {
    const t = montar(verifObs, { online: true, transmitindo: true }, async () => false);
    await t.agendador.verificar();
    expect(t.agendador.historico()).toHaveLength(0);
    expect(t.avisos[0]?.nivel).toBe('info');
  });

  it('roda se o OBS está online sem transmitir', async () => {
    const t = montar(verifObs, { online: true, transmitindo: false }, async () => false);
    await t.agendador.verificar();
    expect(t.agendador.historico()[0]).toMatchObject({ origem: 'verificacao', agendamentoId: 'v1', ok: true });
  });

  it('roda se o OBS está offline', async () => {
    const t = montar(verifObs, { online: false, transmitindo: false }, async () => false);
    await t.agendador.verificar();
    expect(t.agendador.historico()).toHaveLength(1);
  });

  it('roda se a máquina nem tem estado', async () => {
    const t = montar(verifObs, undefined, async () => false);
    await t.agendador.verificar();
    expect(t.agendador.historico()).toHaveLength(1);
  });

  it('avalia uma vez só por dia', async () => {
    const t = montar(verifObs, { online: true, transmitindo: false }, async () => false);
    await t.agendador.verificar();
    t.avancar(domingo(18, 56));
    await t.agendador.verificar();
    expect(t.agendador.historico()).toHaveLength(1);
  });
});

describe('verificação: YouTube sem live', () => {
  it('não roda se o canal está ao vivo', async () => {
    const t = montar(verifYoutube, undefined, async () => true);
    await t.agendador.verificar();
    expect(t.agendador.historico()).toHaveLength(0);
  });

  it('roda se não há live', async () => {
    const t = montar(verifYoutube, undefined, async () => false);
    await t.agendador.verificar();
    expect(t.agendador.historico()[0]).toMatchObject({ origem: 'verificacao' });
  });

  it('com erro na consulta, não roda e avisa com alerta', async () => {
    const t = montar(verifYoutube, undefined, async () => {
      throw new ErroDriver('O YouTube demorou demais para responder.');
    });
    await t.agendador.verificar();
    expect(t.agendador.historico()).toHaveLength(0);
    expect(t.avisos[0]).toMatchObject({ nivel: 'alerta' });
    expect(t.avisos[0]?.texto).toContain('Não consegui verificar o YouTube');
  });

  it('sem configuração, não consulta, não roda e avisa', async () => {
    const t = montar(verifYoutube, undefined, async () => false, false);
    await t.agendador.verificar();
    expect(t.aoVivo).not.toHaveBeenCalled();
    expect(t.agendador.historico()).toHaveLength(0);
    expect(t.avisos[0]?.nivel).toBe('alerta');
  });
});
