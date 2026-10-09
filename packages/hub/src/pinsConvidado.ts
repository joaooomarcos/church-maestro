import { randomBytes, randomInt } from 'node:crypto';
import { DIGITOS_PIN_LINK_FIXO } from '@maestro/shared';
import type { ContextoApp } from './rotas/contexto.js';

const PIN_VALIDO = new RegExp(`^\\d{${DIGITOS_PIN_LINK_FIXO}}$`);

/** PIN numérico aleatório de 4 dígitos (os de convidado têm sempre esse tamanho). */
export function gerarPin(): string {
  return String(randomInt(0, 10 ** DIGITOS_PIN_LINK_FIXO)).padStart(DIGITOS_PIN_LINK_FIXO, '0');
}

/**
 * Migração na inicialização: todo PIN de convidado (o do link temporário e o
 * dos links fixos) passa a ter exatamente 4 dígitos. O que já estiver certo
 * fica intacto. Nos links fixos a versão do PIN também muda, o que derruba as
 * sessões antigas. A leitura da config nunca falha por causa de PIN antigo.
 */
export async function normalizarPinsConvidado(
  ctx: ContextoApp,
  log: { warn: (mensagem: string) => void },
): Promise<void> {
  if (!PIN_VALIDO.test(ctx.config.pinConvidado)) {
    await ctx.atualizarConfigHub({ pinConvidado: gerarPin() });
    log.warn(
      'O PIN de convidado antigo não tinha 4 dígitos e foi trocado por um novo. Veja o novo PIN em Controle remoto.',
    );
  }
  for (const link of ctx.linksConvidado()) {
    if (PIN_VALIDO.test(link.pin)) continue;
    await ctx.salvarLinkConvidado({ ...link, pin: gerarPin(), versaoPin: randomBytes(8).toString('hex') });
    log.warn(
      `O PIN do link fixo "${link.nome}" não tinha 4 dígitos e foi trocado por um novo (os celulares conectados foram desconectados).`,
    );
  }
}
