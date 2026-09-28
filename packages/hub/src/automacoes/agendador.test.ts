import { describe, it, expect } from 'vitest';
import type { Agendamento } from '@maestro/shared';
import { criarAgendador, deveRodar, proximaExecucao, chaveDoDia } from './agendador.js';
import { criarContexto } from '../rotas/contexto.js';
import { Store } from '../estado/store.js';
import type { Drivers } from '../drivers/tipos.js';

// 2026-09-27 é um domingo.
const domingo = (hora: number, minuto: number, segundo = 0): Date => new Date(2026, 8, 27, hora, minuto, segundo);

const preCulto: Agendamento = { id: 'a1', cenarioId: 'pre-culto', dias: [0], hora: '18:50', ativo: true };

describe('deveRodar', () => {
  it('roda no dia e na hora', () => {
    expect(deveRodar(preCulto, domingo(18, 50, 5), undefined)).toBe(true);
  });

  it('não roda antes da hora nem muito depois', () => {
    expect(deveRodar(preCulto, domingo(18, 49, 59), undefined)).toBe(false);
    expect(deveRodar(preCulto, domingo(18, 52, 1), undefined)).toBe(false);
  });

  it('não roda em outro dia da semana', () => {
    expect(deveRodar(preCulto, new Date(2026, 8, 28, 18, 50, 5), undefined)).toBe(false);
  });

  it('roda uma vez só no dia', () => {
    expect(deveRodar(preCulto, domingo(18, 51), chaveDoDia(domingo(18, 50)))).toBe(false);
  });

  it('não roda desativado', () => {
    expect(deveRodar({ ...preCulto, ativo: false }, domingo(18, 50, 5), undefined)).toBe(false);
  });
});

describe('proximaExecucao', () => {
  it('é hoje mais tarde quando ainda não passou da hora', () => {
    expect(proximaExecucao(preCulto, domingo(10, 0))).toBe(domingo(18, 50).getTime());
  });

  it('é no domingo seguinte quando já passou', () => {
    expect(proximaExecucao(preCulto, domingo(19, 0))).toBe(new Date(2026, 9, 4, 18, 50).getTime());
  });
});

describe('criarAgendador', () => {
  function montar(ativo: boolean, relogio: () => Date) {
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
      // Um passo de espera não precisa de driver nenhum.
      cenarios: [{ id: 'pre-culto', nome: 'Pré-culto', acoes: [{ tipo: 'espera', ms: 1 }] }],
      automacoes: { ativo, agendamentos: [preCulto] },
      dispositivos: [],
      caminhoDispositivos: '/nao-grava',
      caminhoHub: '/nao-grava',
      persistir: false,
    });
    return criarAgendador(ctx, relogio);
  }

  it('roda o cenário na hora e registra no histórico, uma vez só', async () => {
    let agora = domingo(18, 50, 10);
    const agendador = montar(true, () => agora);

    await agendador.verificar();
    agora = domingo(18, 51, 0);
    await agendador.verificar();

    expect(agendador.historico()).toHaveLength(1);
    expect(agendador.historico()[0]).toMatchObject({ cenarioNome: 'Pré-culto', ok: true });
  });

  it('com as automações desligadas, não roda nada', async () => {
    const agendador = montar(false, () => domingo(18, 50, 10));
    await agendador.verificar();
    expect(agendador.historico()).toHaveLength(0);
  });
});
