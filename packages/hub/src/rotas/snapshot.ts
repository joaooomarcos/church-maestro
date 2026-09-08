import type { FastifyInstance } from 'fastify';
import { ROTAS } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import type { SocketTransmissao } from '../estado/store.js';

export function registrarRotasSnapshot(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.snapshot, async (_req, reply) => {
    return reply.send(ctx.store.obterSnapshot());
  });

  app.get(ROTAS.ws, { websocket: true }, (socket) => {
    const transmissao = socket as unknown as SocketTransmissao;
    ctx.store.adicionarSocket(transmissao);
    socket.on('close', () => ctx.store.removerSocket(transmissao));
    socket.on('error', () => ctx.store.removerSocket(transmissao));
  });
}
