import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ROTAS } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';
import { varrerRede } from '../rede/varredura.js';

const corpoVarreduraSchema = z.object({ cidr: z.string().optional() }).optional();

export function registrarRotasVarredura(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.varredura, async (req, reply) => {
    const corpo = corpoVarreduraSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, 'CIDR inválido.');
    }

    let servicos;
    try {
      servicos = await varrerRede(corpo.data?.cidr);
    } catch (erro) {
      return responderRequisicaoInvalida(reply, erro instanceof Error ? erro.message : 'falha na varredura');
    }

    // Casa cada serviço achado com um dispositivo já cadastrado que use o mesmo host.
    const dispositivos = ctx.dispositivos();
    const combinados = servicos.map((s) => {
      const dono = dispositivos.find((d) => d.host === s.host);
      return dono ? { ...s, dispositivoId: dono.id } : s;
    });

    ctx.store.definirNaoIdentificados(combinados);
    return reply.send({ servicos: combinados });
  });
}
