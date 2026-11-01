import { describe, expect, it } from 'vitest';
import { arquivoAutomacoesSchema } from '@maestro/shared';

describe('LEGADO-AL: automações "ao ligar" da versão anterior', () => {
  const horario = { id: 'a1', tipo: 'horario', cenarioId: 'pre-culto', dias: [0], hora: '18:50', ativo: true };
  const horarioAntigo = { id: 'a2', cenarioId: 'louvor', dias: [3], hora: '19:30', ativo: true };
  const aoLigar = {
    id: 'a3',
    tipo: 'aoLigar',
    dispositivo: 'fundo',
    cenarioId: 'pre-culto',
    esperaSegundos: 30,
    ativo: true,
  };

  it('LEGADO-AL-01: arquivo antigo carrega sem as entradas "ao ligar" e mantém os agendamentos por horário', () => {
    const lido = arquivoAutomacoesSchema.parse({ ativo: true, agendamentos: [horario, aoLigar, horarioAntigo] });
    expect(lido.agendamentos.map((a) => a.id)).toEqual(['a1', 'a2']);
  });

  it('LEGADO-AL-02: arquivo só com "ao ligar" vira lista vazia, sem erro', () => {
    const lido = arquivoAutomacoesSchema.parse({ ativo: false, agendamentos: [aoLigar] });
    expect(lido).toEqual({ ativo: false, agendamentos: [] });
  });

  it('LEGADO-AL-03: o que está estragado de verdade (horário inválido) continua sendo recusado', () => {
    expect(() =>
      arquivoAutomacoesSchema.parse({ agendamentos: [{ ...horario, hora: '25:99' }, aoLigar] }),
    ).toThrow();
  });
});
