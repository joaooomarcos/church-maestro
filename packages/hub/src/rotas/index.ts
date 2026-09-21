import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { SERVICO_HUB } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { registrarRotasSnapshot } from './snapshot.js';
import { registrarRotasDispositivos } from './dispositivos.js';
import { registrarRotasVarredura } from './varredura.js';
import { registrarRotasAgentes } from './agentes.js';
import { registrarRotasPareamento } from './pareamento.js';
import { registrarRotasVersoes } from './versoes.js';
import { registrarRotasNdi } from './ndi.js';
import { registrarRotasHolyrics } from './holyrics.js';
import { registrarRotasPowerPoint } from './powerpoint.js';
import { registrarRotasCenarios } from './cenarios.js';

export type { ContextoApp } from './contexto.js';
export { criarContexto } from './contexto.js';

export function registrarRotas(app: FastifyInstance, ctx: ContextoApp): void {
  // `servico` identifica o hub para o agente que varre a rede procurando por ele;
  // `instancia` é estável entre reinícios e deixa o agente perceber que 127.0.0.1
  // e o IP da rede são o mesmo hub, em vez de oferecer dois.
  const instancia = createHash('sha256').update(ctx.config.segredoSessao).digest('hex').slice(0, 12);
  app.get('/health', async (_req, reply) =>
    reply.send({ ok: true, servico: SERVICO_HUB, instancia }),
  );

  registrarRotasSnapshot(app, ctx);
  registrarRotasDispositivos(app, ctx);
  registrarRotasVarredura(app, ctx);
  registrarRotasAgentes(app, ctx);
  registrarRotasPareamento(app, ctx);
  registrarRotasVersoes(app, ctx);
  registrarRotasNdi(app, ctx);
  registrarRotasHolyrics(app, ctx);
  registrarRotasPowerPoint(app, ctx);
  registrarRotasCenarios(app, ctx);
}
