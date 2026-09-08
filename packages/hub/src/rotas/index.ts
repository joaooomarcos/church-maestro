import type { FastifyInstance } from 'fastify';
import type { ContextoApp } from './contexto.js';
import { registrarRotasSnapshot } from './snapshot.js';
import { registrarRotasDispositivos } from './dispositivos.js';
import { registrarRotasVarredura } from './varredura.js';
import { registrarRotasAgentes } from './agentes.js';
import { registrarRotasNdi } from './ndi.js';
import { registrarRotasHolyrics } from './holyrics.js';
import { registrarRotasPowerPoint } from './powerpoint.js';
import { registrarRotasCenarios } from './cenarios.js';

export type { ContextoApp } from './contexto.js';
export { criarContexto } from './contexto.js';

export function registrarRotas(app: FastifyInstance, ctx: ContextoApp): void {
  app.get('/health', async (_req, reply) => reply.send({ ok: true }));

  registrarRotasSnapshot(app, ctx);
  registrarRotasDispositivos(app, ctx);
  registrarRotasVarredura(app, ctx);
  registrarRotasAgentes(app, ctx);
  registrarRotasNdi(app, ctx);
  registrarRotasHolyrics(app, ctx);
  registrarRotasPowerPoint(app, ctx);
  registrarRotasCenarios(app, ctx);
}
