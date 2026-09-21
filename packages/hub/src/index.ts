import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { ErroApi } from '@maestro/shared';

import { carregarConfiguracao } from './config.js';
import { registrarAutenticacao } from './auth.js';
import { Store } from './estado/store.js';
import { Poller } from './estado/poller.js';
import { criarContexto, registrarRotas } from './rotas/index.js';
import { criarDrivers } from './drivers/index.js';
import { dispositivosDemo } from './drivers/mock.js';
import { registrarRotasChecks } from './checks/index.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const pastaWeb = path.join(aqui, '../../web/dist');

async function principal(): Promise<void> {
  const configuracao = await carregarConfiguracao();
  const usarMock = process.env.MAESTRO_MOCK === '1';
  const drivers = criarDrivers(usarMock, configuracao.hub.tokenAgentes);
  // Em modo mock os dispositivos vêm prontos e não são persistidos, para não
  // sujar a configuração de uma instalação real com endereços de mentira.
  const dispositivos = usarMock ? dispositivosDemo() : configuracao.dispositivos;

  const app = Fastify({ logger: true });

  await app.register(fastifyCookie, {
    secret: configuracao.hub.segredoSessao,
    hook: 'onRequest',
  });
  await app.register(fastifyWebsocket);
  await app.register(fastifyRateLimit, { global: false });

  const temFrontBuildado = fs.existsSync(pastaWeb);
  if (temFrontBuildado) {
    await app.register(fastifyStatic, { root: pastaWeb });
  } else {
    app.log.warn(
      `pasta do front-end não encontrada em "${pastaWeb}" — rode o build de @maestro/web ou sirva-o separadamente`,
    );
  }

  const store = new Store();
  const ctx = criarContexto({
    config: configuracao.hub,
    drivers,
    store,
    cenarios: configuracao.cenarios,
    dispositivos,
    caminhoDispositivos: configuracao.caminhos.dispositivos,
    caminhoHub: configuracao.caminhos.hub,
    persistir: !usarMock,
  });

  await registrarAutenticacao(app, configuracao.hub);
  registrarRotas(app, ctx);
  registrarRotasChecks(app, ctx);

  // Depois de toda rota de API registrada: 404 de GET não-`/api` cai na SPA; o resto vira erro JSON normal.
  app.setNotFoundHandler((req, reply) => {
    if (temFrontBuildado && req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    const corpo: ErroApi = { erro: 'nao_encontrado', mensagem: 'Rota não encontrada.' };
    return reply.code(404).send(corpo);
  });

  const poller = new Poller({
    dispositivos: () => ctx.dispositivos(),
    drivers,
    store,
    intervaloMs: configuracao.hub.intervaloPollingMs,
  });
  poller.iniciar();

  await app.listen({ port: configuracao.hub.porta, host: '0.0.0.0' });

  let encerrando = false;
  const encerrar = (sinal: string): void => {
    if (encerrando) return;
    encerrando = true;
    app.log.info(`recebido ${sinal}, encerrando…`);
    poller.parar();
    void drivers.obs
      .encerrar()
      .catch((erro: unknown) => app.log.warn({ erro }, 'falha ao encerrar driver do OBS'))
      .finally(() => {
        void app.close().finally(() => process.exit(0));
      });
  };
  process.on('SIGINT', () => encerrar('SIGINT'));
  process.on('SIGTERM', () => encerrar('SIGTERM'));
}

principal().catch((erro: unknown) => {
  console.error('falha ao iniciar o hub:', erro);
  process.exit(1);
});
