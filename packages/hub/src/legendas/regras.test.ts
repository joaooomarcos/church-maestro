import { describe, it, expect } from 'vitest';
import { descreverFaixa, faixaProibidaAgora, resolverLegendas, usaHolyrics, type DispositivoConfig } from '@maestro/shared';
import { dispositivosDemo } from '../drivers/mock.js';

/** Regras das legendas que moram em @maestro/shared (o painel usa as mesmas). */

describe('faixaProibidaAgora', () => {
  const culto = { dias: [0], inicio: '19:00', fim: '21:30' };

  it('acha a faixa dentro do horário e do dia', () => {
    expect(faixaProibidaAgora([culto], new Date(2026, 9, 4, 19, 0))).toBe(culto);
    expect(faixaProibidaAgora([culto], new Date(2026, 9, 4, 21, 29))).toBe(culto);
  });

  it('libera fora do horário ou em outro dia', () => {
    expect(faixaProibidaAgora([culto], new Date(2026, 9, 4, 21, 30))).toBeNull();
    expect(faixaProibidaAgora([culto], new Date(2026, 9, 5, 20, 0))).toBeNull();
  });

  it('atravessa a meia-noite quando o fim vem antes do início', () => {
    const vigilia = { dias: [5], inicio: '22:00', fim: '02:00' };
    expect(faixaProibidaAgora([vigilia], new Date(2026, 9, 9, 23, 0))).toBe(vigilia); // sexta
    expect(faixaProibidaAgora([vigilia], new Date(2026, 9, 10, 1, 0))).toBe(vigilia); // madrugada de sábado
    expect(faixaProibidaAgora([vigilia], new Date(2026, 9, 10, 3, 0))).toBeNull();
  });

  it('descreve a faixa como a tela mostra', () => {
    expect(descreverFaixa({ dias: [3, 0], inicio: '19:00', fim: '21:30' })).toBe('Dom, Qua 19:00–21:30');
  });
});

describe('resolverLegendas', () => {
  it('usa a configuração nova quando existe', () => {
    const r = resolverLegendas(dispositivosDemo());
    expect(r?.legado).toBe(false);
    expect(r?.obs.id).toBe('pc-transmissao');
    expect(r?.config.holyrics).toHaveLength(2);
  });

  it('monta a equivalente a partir do formato antigo', () => {
    const antigos: DispositivoConfig[] = dispositivosDemo().map((d) =>
      d.servicos.obs ? { ...d, servicos: { ...d.servicos, obs: { porta: 4455, sourceLegenda: 'Legenda' } } } : d,
    );
    const r = resolverLegendas(antigos);
    expect(r?.legado).toBe(true);
    expect(r?.config.holyrics).toEqual([{ dispositivo: 'note-frente', fonteMusica: 'Legenda' }]);
  });

  it('devolve null sem nenhuma das duas', () => {
    expect(resolverLegendas([])).toBeNull();
  });
});

describe('usaHolyrics', () => {
  it('segue "Programas de cada máquina" e, sem escolha, vale o que está configurado', () => {
    const [, noteFrente] = dispositivosDemo();
    expect(usaHolyrics(noteFrente as DispositivoConfig)).toBe(true);
    expect(usaHolyrics({ ...(noteFrente as DispositivoConfig), apps: ['powerpoint'] })).toBe(false);
    expect(usaHolyrics({ ...(noteFrente as DispositivoConfig), apps: ['holyrics'] })).toBe(true);
  });
});
