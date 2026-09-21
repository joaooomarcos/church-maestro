import type { FastifyInstance } from 'fastify';
import { ROTAS, heartbeatAgenteSchema, type ErroApi } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

/** Registro de agente usa o token compartilhado no header, não a sessão de PIN. */
export function registrarRotasAgentes(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.registrarAgente, async (req, reply) => {
    const token = req.headers['x-maestro-token'];
    if (token !== ctx.config.tokenAgentes) {
      const erro: ErroApi = { erro: 'token_invalido', mensagem: 'Token de agente inválido.' };
      return reply.code(401).send(erro);
    }

    const corpo = heartbeatAgenteSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Heartbeat inválido: ${corpo.error.message}`);
    }
    const heartbeat = corpo.data;

    const dispositivo = ctx.obterDispositivo(heartbeat.dispositivoId);
    if (!dispositivo) {
      const erro: ErroApi = {
        erro: 'dispositivo_nao_pareado',
        mensagem: `A máquina "${heartbeat.dispositivoId}" não está pareada neste hub. Rode "npm run setup" nela.`,
      };
      return reply.code(404).send(erro);
    }

    ctx.store.registrarHeartbeat(heartbeat.dispositivoId, heartbeat);

    const novoHost = heartbeat.ips[0];
    if (!dispositivo.fixarHost && novoHost && novoHost !== dispositivo.host) {
      await ctx.atualizarDispositivo({ ...dispositivo, host: novoHost });
    }

    return reply.send({ ok: true });
  });
}
