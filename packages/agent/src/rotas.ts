import { timingSafeEqual } from 'node:crypto';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import {
  comandoAppSchema,
  comandoPptSchema,
  pedidoAtualizarAgenteSchema,
  saudeAgenteSchema,
  type ConfigAgente,
  type ErroApi,
} from '@maestro/shared';
import { ErroApp, executarAcaoApp, situacaoDosApps } from './apps/index.js';
import { montarHeartbeat } from './heartbeat.js';
import { SHA_VALIDO, dispararAtualizacao, lerEstadoAtualizacao } from './versao.js';
import { listarProcessos } from './processos.js';
import { ErroPowerPoint, type PontePowerPoint } from './ppt/tipos.js';

const ERRO_SEM_POWERPOINT: ErroApi = {
  erro: 'sem-powerpoint',
  mensagem: 'Esta máquina não tem PowerPoint disponível.',
};

function tokenValido(esperado: string, recebido: unknown): boolean {
  if (typeof recebido !== 'string') return false;
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  // timingSafeEqual exige buffers do mesmo tamanho, então checa antes.
  return a.length === b.length && timingSafeEqual(a, b);
}

function exigirToken(config: ConfigAgente) {
  return (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    if (!tokenValido(config.token, req.headers['x-maestro-token'])) {
      const corpo: ErroApi = { erro: 'nao-autorizado', mensagem: 'Token do agente ausente ou inválido.' };
      reply.code(401).send(corpo);
      return;
    }
    done();
  };
}

export function criarServidor(config: ConfigAgente, ponte: PontePowerPoint): FastifyInstance {
  const app = Fastify({ logger: false });
  const comToken = exigirToken(config);

  app.get('/health', async () => {
    const [heartbeat, atualizacao] = await Promise.all([
      montarHeartbeat(config, ponte),
      lerEstadoAtualizacao(),
    ]);
    return saudeAgenteSchema.parse({
      ...heartbeat,
      ts: Date.now(),
      ...(atualizacao ? { atualizacao } : {}),
    });
  });

  /** O hub manda atualizar esta máquina; quem executa é o atualizador, solto daqui. */
  app.post('/atualizar', { preHandler: comToken }, async (req: FastifyRequest, reply: FastifyReply) => {
    const analisado = pedidoAtualizarAgenteSchema.safeParse(req.body);
    if (!analisado.success || !SHA_VALIDO.test(analisado.data.sha)) {
      const corpo: ErroApi = { erro: 'sha-invalido', mensagem: 'Versão inválida para atualizar.' };
      reply.code(400).send(corpo);
      return;
    }

    dispararAtualizacao(analisado.data.sha);
    return { aceito: true };
  });

  app.get('/processos', { preHandler: comToken }, async () => listarProcessos());

  app.get('/apps', { preHandler: comToken }, async () => situacaoDosApps(config));

  app.post('/apps/acao', { preHandler: comToken }, async (req: FastifyRequest, reply: FastifyReply) => {
    const analisado = comandoAppSchema.safeParse(req.body);
    if (!analisado.success) {
      const corpo: ErroApi = { erro: 'comando-invalido', mensagem: 'Ação de aplicativo inválida.' };
      reply.code(400).send(corpo);
      return;
    }

    try {
      await executarAcaoApp(analisado.data.app, analisado.data.acao, config);
      return { ok: true };
    } catch (err) {
      if (err instanceof ErroApp) {
        const corpo: ErroApi = { erro: 'falha-app', mensagem: err.message, detalhe: err.causaTecnica };
        reply.code(502).send(corpo);
        return;
      }
      throw err;
    }
  });

  app.get('/ppt/status', { preHandler: comToken }, async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!ponte.disponivel) {
      reply.code(501).send(ERRO_SEM_POWERPOINT);
      return;
    }
    return ponte.status();
  });

  app.post('/ppt/acao', { preHandler: comToken }, async (req: FastifyRequest, reply: FastifyReply) => {
    if (!ponte.disponivel) {
      reply.code(501).send(ERRO_SEM_POWERPOINT);
      return;
    }

    const analisado = comandoPptSchema.safeParse(req.body);
    if (!analisado.success) {
      const corpo: ErroApi = {
        erro: 'comando-invalido',
        mensagem: 'Comando de PowerPoint inválido.',
        detalhe: analisado.error.message,
      };
      reply.code(400).send(corpo);
      return;
    }

    return ponte.executar(analisado.data);
  });

  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    // FastifyError exige `code`, que ErroPowerPoint não tem; sem este alias o
    // `instanceof` não estreita o tipo.
    const bruto: unknown = err;
    if (bruto instanceof ErroPowerPoint) {
      const corpo: ErroApi = {
        erro: 'erro-powerpoint',
        mensagem: bruto.message,
        detalhe: bruto.causaTecnica,
      };
      reply.code(502).send(corpo);
      return;
    }
    reply.send(err);
  });

  return app;
}

export async function iniciarServidor(config: ConfigAgente, ponte: PontePowerPoint): Promise<FastifyInstance> {
  const app = criarServidor(config, ponte);
  await app.listen({ host: '0.0.0.0', port: config.porta });
  return app;
}
