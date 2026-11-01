import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { ROTAS } from '@maestro/shared';
import { criarContexto } from './contexto.js';
import { registrarRotasAjustes } from './ajustes.js';
import { Store } from '../estado/store.js';
import { ErroDriver, type Drivers } from '../drivers/tipos.js';

const CHAVE = 'AIzaChaveSecretaDeTeste123';
const CANAL = 'UCabcdefghijklmnopqrstuv';

async function montar(aoVivo = vi.fn(async () => true)) {
  const ctx = criarContexto({
    config: {
      porta: 8700, pin: '1234', segredoSessao: 'x'.repeat(16), tokenAgentes: 'y'.repeat(16),
      intervaloHeartbeatMs: 10_000, pinConvidado: '4321', intervaloPollingMs: 2000, varreduraAutomaticaMin: 10,
    },
    drivers: { youtube: { aoVivo } } as unknown as Drivers,
    store: new Store(),
    cenarios: [],
    dispositivos: [],
    caminhoDispositivos: '/nao-grava',
    caminhoHub: '/nao-grava',
    persistir: false,
  });
  const app = Fastify();
  registrarRotasAjustes(app, ctx);
  return { app, ctx, aoVivo };
}

describe('rotas de ajustes do YouTube', () => {
  it('guarda canal e chave, mas a resposta nunca traz a chave', async () => {
    const { app, ctx } = await montar();
    const salvar = await app.inject({ method: 'POST', url: ROTAS.ajustes, payload: { youtubeCanalId: CANAL, youtubeChaveApi: CHAVE } });
    expect(salvar.statusCode).toBe(200);
    expect(salvar.body).not.toContain(CHAVE);
    expect(salvar.json()).toMatchObject({ youtubeCanalId: CANAL, youtubeConfigurado: true });
    expect(ctx.config.youtubeChaveApi).toBe(CHAVE);

    const ler = await app.inject({ method: 'GET', url: ROTAS.ajustes });
    expect(ler.body).not.toContain(CHAVE);
  });

  it('chave vazia mantém a atual; remover apaga', async () => {
    const { app, ctx } = await montar();
    await app.inject({ method: 'POST', url: ROTAS.ajustes, payload: { youtubeCanalId: CANAL, youtubeChaveApi: CHAVE } });
    await app.inject({ method: 'POST', url: ROTAS.ajustes, payload: { youtubeChaveApi: '' } });
    expect(ctx.config.youtubeChaveApi).toBe(CHAVE);
    const r = await app.inject({ method: 'POST', url: ROTAS.ajustes, payload: { removerYoutubeChave: true } });
    expect(ctx.config.youtubeChaveApi).toBeUndefined();
    expect(r.json()).toMatchObject({ youtubeConfigurado: false });
  });

  it('recusa canal fora do formato UC...', async () => {
    const { app } = await montar();
    const r = await app.inject({ method: 'POST', url: ROTAS.ajustes, payload: { youtubeCanalId: 'meu-canal' } });
    expect(r.statusCode).toBe(400);
  });

  it('teste devolve aoVivo; sem configuração dá 400', async () => {
    const { app, aoVivo } = await montar();
    expect((await app.inject({ method: 'POST', url: ROTAS.youtubeTeste })).statusCode).toBe(400);
    await app.inject({ method: 'POST', url: ROTAS.ajustes, payload: { youtubeCanalId: CANAL, youtubeChaveApi: CHAVE } });
    const r = await app.inject({ method: 'POST', url: ROTAS.youtubeTeste });
    expect(r.json()).toEqual({ aoVivo: true });
    expect(aoVivo).toHaveBeenCalledWith({ canalId: CANAL, chaveApi: CHAVE });
  });

  it('erro do driver vira 502 sem a chave', async () => {
    const { app } = await montar(vi.fn(async () => { throw new ErroDriver('O YouTube recusou a chave de API.', 'HTTP 403'); }));
    await app.inject({ method: 'POST', url: ROTAS.ajustes, payload: { youtubeCanalId: CANAL, youtubeChaveApi: CHAVE } });
    const r = await app.inject({ method: 'POST', url: ROTAS.youtubeTeste });
    expect(r.statusCode).toBe(502);
    expect(r.body).not.toContain(CHAVE);
  });
});
