import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROTAS } from '@maestro/shared';
import { checarLegendas } from './legendas.js';
import { checarNdi } from './ndi.js';
import type { ContextoCheck } from './tipos.js';

export * from './tipos.js';
export { checarLegendas } from './legendas.js';
export { checarNdi } from './ndi.js';

const corpoLegendasSchema = z
  .object({
    /** "Forçar teste": ignora horário proibido e OBS no ar (nunca Holyrics exibindo). */
    forcar: z.boolean().optional(),
    holyrics: z.array(z.string()).optional(),
    esperaRenderizacaoMs: z.number().int().positive().max(15_000).optional(),
    esperaReferenciaMs: z.number().int().positive().max(5000).optional(),
    esperaGrupoMs: z.number().int().positive().max(15_000).optional(),
  })
  .default({});

export function registrarRotasChecks(app: FastifyInstance, ctx: ContextoCheck): void {
  app.post(ROTAS.checkLegendas, async (req) => {
    const opcoes = corpoLegendasSchema.parse(req.body ?? {});
    return checarLegendas(ctx, opcoes);
  });

  app.post(ROTAS.checkNdi, async () => checarNdi(ctx));
}
