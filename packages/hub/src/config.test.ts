import { describe, expect, it } from 'vitest';
import { configHubSchema } from '@maestro/shared';

const base = { segredoSessao: 'x'.repeat(16), tokenAgentes: 'y'.repeat(8) };

describe('PIN da equipe na config do hub', () => {
  it('aceita exatamente 4 dígitos', () => {
    expect(configHubSchema.safeParse({ ...base, pin: '1234' }).success).toBe(true);
  });

  it.each(['123', '12345', 'abcd', '12a4', ''])('rejeita "%s"', (pin) => {
    expect(configHubSchema.safeParse({ ...base, pin }).success).toBe(false);
  });
});
