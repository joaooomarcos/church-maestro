import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import {
  ROTAS,
  acaoPermitida,
  dispositivoConfigSchema,
  type ModoConvidado,
  type NomeAcaoConvidado,
} from '@maestro/shared';
import { criarContexto } from './contexto.js';
import { registrarRotasConvidado } from './convidado.js';
import { Store } from '../estado/store.js';
import type { Drivers } from '../drivers/tipos.js';
import { carregarOuCriarConvidados } from '../config.js';

const TOKEN_TEMP = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function criarDrivers() {
  const holyrics = {
    proximo: vi.fn(async () => {}),
    anterior: vi.fn(async () => {}),
    mostrarLetra: vi.fn(async () => {}),
    definirF: vi.fn(async () => {}),
    encerrarApresentacao: vi.fn(async () => {}),
    listarPlaylist: vi.fn(async () => [{ id: '1', titulo: 'Música' }]),
  };
  const agente = {
    comandarPowerPoint: vi.fn(async () => ({})),
    teclaApp: vi.fn(async () => {}),
    miniaturaPowerPoint: vi.fn(async () => ({ imagem: Buffer.from('x'), tipo: 'image/png', slide: 1 })),
  };
  return { holyrics, agente };
}

async function montar(opcoes: { modo?: ModoConvidado; completo?: boolean } = {}) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'maestro-convidado-'));
  const drivers = criarDrivers();
  const dispositivo = dispositivoConfigSchema.parse({
    id: 'note',
    nome: 'Note',
    host: '10.0.0.5',
    servicos: { agente: { porta: 8770 }, holyrics: { porta: 80, token: 'tokenholyrics' } },
    tokenConvidado: TOKEN_TEMP,
    ...(opcoes.modo ? { modoConvidado: opcoes.modo } : {}),
    ...(opcoes.completo ? { completoConvidado: true } : {}),
  });
  const ctx = criarContexto({
    config: {
      porta: 8700,
      pin: '1234',
      segredoSessao: 'x'.repeat(16),
      tokenAgentes: 'y'.repeat(16),
      intervaloHeartbeatMs: 10_000,
      pinConvidado: '4321',
      intervaloPollingMs: 2000,
      varreduraAutomaticaMin: 10,
    },
    drivers: drivers as unknown as Drivers,
    store: new Store(),
    cenarios: [],
    dispositivos: [dispositivo],
    caminhoDispositivos: path.join(pasta, 'devices.json'),
    caminhoHub: path.join(pasta, 'hub.json'),
    caminhoConvidados: path.join(pasta, 'convidados.json'),
  });
  const app = Fastify();
  await app.register(fastifyCookie, { secret: 'x'.repeat(16), hook: 'onRequest' });
  await app.register(fastifyRateLimit, { global: false });
  registrarRotasConvidado(app, ctx);
  return { app, ctx, drivers, caminhoConvidados: path.join(pasta, 'convidados.json') };
}

type App = Awaited<ReturnType<typeof montar>>['app'];

/** Entra com o PIN e devolve o cookie para as chamadas seguintes. */
async function entrar(app: App, token: string, pin: string): Promise<string> {
  const resposta = await app.inject({ method: 'POST', url: ROTAS.convidadoEntrar, payload: { token, pin } });
  expect(resposta.statusCode).toBe(200);
  const cookie = resposta.cookies.find((c) => c.name === 'maestro_convidado');
  expect(cookie).toBeDefined();
  return `maestro_convidado=${cookie?.value}`;
}

function agir(app: App, cookie: string, payload: object) {
  return app.inject({ method: 'POST', url: ROTAS.convidadoAcao, headers: { cookie }, payload });
}

describe('acaoPermitida', () => {
  const todas: NomeAcaoConvidado[] = ['proximo', 'anterior', 'mostrarLetra', 'f8', 'f9', 'f10', 'encerrar', 'iniciar'];

  it('sem controle completo só vale voltar e avançar', () => {
    for (const modo of ['holyrics', 'powerpoint', 'teclado'] as const) {
      expect(todas.filter((a) => acaoPermitida(modo, a, false))).toEqual(['proximo', 'anterior']);
    }
  });

  it('completo no Holyrics libera lista, F8/F9/F10 e sair, mas não iniciar', () => {
    expect(acaoPermitida('holyrics', 'mostrarLetra', true)).toBe(true);
    expect(acaoPermitida('holyrics', 'f10', true)).toBe(true);
    expect(acaoPermitida('holyrics', 'encerrar', true)).toBe(true);
    expect(acaoPermitida('holyrics', 'iniciar', true)).toBe(false);
  });

  it('completo no PowerPoint libera iniciar e encerrar, mas não F8 nem lista', () => {
    expect(acaoPermitida('powerpoint', 'iniciar', true)).toBe(true);
    expect(acaoPermitida('powerpoint', 'encerrar', true)).toBe(true);
    expect(acaoPermitida('powerpoint', 'f8', true)).toBe(false);
    expect(acaoPermitida('powerpoint', 'mostrarLetra', true)).toBe(false);
  });

  it('o modo setas nunca ganha nada além das setas', () => {
    expect(todas.filter((a) => acaoPermitida('teclado', a, true))).toEqual(['proximo', 'anterior']);
  });
});

describe('link temporário', () => {
  it('sem controle completo, o servidor recusa (403) o que passa do avançar/voltar', async () => {
    const { app, drivers } = await montar({ modo: 'holyrics' });
    const cookie = await entrar(app, TOKEN_TEMP, '4321');

    const ok = await agir(app, cookie, { modo: 'holyrics', acao: 'proximo' });
    expect(ok.statusCode).toBe(200);

    for (const acao of ['f8', 'f9', 'f10', 'encerrar', 'mostrarLetra']) {
      const r = await agir(app, cookie, { modo: 'holyrics', acao, letraId: '1' });
      expect(r.statusCode).toBe(403);
    }
    expect(drivers.holyrics.definirF).not.toHaveBeenCalled();
    expect(drivers.holyrics.encerrarApresentacao).not.toHaveBeenCalled();
    expect(drivers.holyrics.mostrarLetra).not.toHaveBeenCalled();
  });

  it('com controle completo, executa as ações do modo', async () => {
    const { app, drivers } = await montar({ modo: 'holyrics', completo: true });
    const cookie = await entrar(app, TOKEN_TEMP, '4321');

    expect((await agir(app, cookie, { modo: 'holyrics', acao: 'f10', ativar: true })).statusCode).toBe(200);
    expect(drivers.holyrics.definirF).toHaveBeenCalledWith(expect.anything(), 10, true);
    expect((await agir(app, cookie, { modo: 'holyrics', acao: 'mostrarLetra', letraId: '7' })).statusCode).toBe(200);
    expect(drivers.holyrics.mostrarLetra).toHaveBeenCalledWith(expect.anything(), '7');
    // Ação de outro modo continua barrada.
    expect((await agir(app, cookie, { modo: 'holyrics', acao: 'iniciar' })).statusCode).toBe(403);
  });

  it('não deixa trocar de modo no corpo do pedido', async () => {
    const { app, drivers } = await montar({ modo: 'holyrics', completo: true });
    const cookie = await entrar(app, TOKEN_TEMP, '4321');
    const r = await agir(app, cookie, { modo: 'powerpoint', acao: 'encerrar' });
    expect(r.statusCode).toBe(403);
    expect(drivers.agente.comandarPowerPoint).not.toHaveBeenCalled();
  });

  it('setas: manda a tecla sem programa e ignora o "completo"', async () => {
    const { app, drivers } = await montar({ modo: 'teclado', completo: true });
    const cookie = await entrar(app, TOKEN_TEMP, '4321');

    expect((await agir(app, cookie, { modo: 'teclado', acao: 'proximo' })).statusCode).toBe(200);
    expect(drivers.agente.teclaApp).toHaveBeenCalledWith(expect.anything(), undefined, 'proximo');
    expect((await agir(app, cookie, { modo: 'teclado', acao: 'encerrar' })).statusCode).toBe(403);

    const estado = await app.inject({ method: 'GET', url: ROTAS.convidadoEstado, headers: { cookie } });
    expect(estado.json().completo).toBe(false);
  });

  it('só devolve lista de reprodução, prévias e dados extras ao link completo', async () => {
    const basico = await montar({ modo: 'holyrics' });
    const cookieBasico = await entrar(basico.app, TOKEN_TEMP, '4321');
    const playlistNegada = await basico.app.inject({
      method: 'GET',
      url: ROTAS.convidadoPlaylist,
      headers: { cookie: cookieBasico },
    });
    expect(playlistNegada.statusCode).toBe(403);
    const estadoBasico = (
      await basico.app.inject({ method: 'GET', url: ROTAS.convidadoEstado, headers: { cookie: cookieBasico } })
    ).json();
    expect(estadoBasico.completo).toBe(false);
    expect(estadoBasico.holyrics).toBeUndefined();
    expect(estadoBasico.powerpoint).toBeUndefined();

    const completo = await montar({ modo: 'holyrics', completo: true });
    const cookie = await entrar(completo.app, TOKEN_TEMP, '4321');
    const playlist = await completo.app.inject({ method: 'GET', url: ROTAS.convidadoPlaylist, headers: { cookie } });
    expect(playlist.statusCode).toBe(200);
    // Prévia de slide é do modo PowerPoint: num link Holyrics continua barrada.
    const slide = await completo.app.inject({ method: 'GET', url: ROTAS.convidadoSlide, headers: { cookie } });
    expect(slide.statusCode).toBe(403);
    const estado = (await completo.app.inject({ method: 'GET', url: ROTAS.convidadoEstado, headers: { cookie } })).json();
    expect(estado.completo).toBe(true);
    expect(estado.holyrics).toBeDefined();
  });

  it('prévia do PowerPoint: só no link completo desse modo', async () => {
    const basico = await montar({ modo: 'powerpoint' });
    const cb = await entrar(basico.app, TOKEN_TEMP, '4321');
    expect(
      (await basico.app.inject({ method: 'GET', url: `${ROTAS.convidadoSlide}?qual=atual`, headers: { cookie: cb } }))
        .statusCode,
    ).toBe(403);

    const completo = await montar({ modo: 'powerpoint', completo: true });
    const cc = await entrar(completo.app, TOKEN_TEMP, '4321');
    const r = await completo.app.inject({
      method: 'GET',
      url: `${ROTAS.convidadoSlide}?qual=proximo`,
      headers: { cookie: cc },
    });
    expect(r.statusCode).toBe(200);
    expect(completo.drivers.agente.miniaturaPowerPoint).toHaveBeenCalledWith(expect.anything(), 'proximo');
  });

  it('sem cookie nada funciona (401)', async () => {
    const { app } = await montar({ modo: 'holyrics', completo: true });
    const r = await app.inject({ method: 'POST', url: ROTAS.convidadoAcao, payload: { modo: 'holyrics', acao: 'proximo' } });
    expect(r.statusCode).toBe(401);
  });

  it('PIN errado não entra', async () => {
    const { app } = await montar({ modo: 'holyrics' });
    const r = await app.inject({ method: 'POST', url: ROTAS.convidadoEntrar, payload: { token: TOKEN_TEMP, pin: '0000' } });
    expect(r.statusCode).toBe(401);
  });
});

describe('links fixos', () => {
  async function criar(m: Awaited<ReturnType<typeof montar>>, extra: object = {}) {
    const r = await m.app.inject({
      method: 'POST',
      url: ROTAS.convidadoFixos,
      payload: { nome: 'Louvor — Note', dispositivo: 'note', modo: 'holyrics', completo: true, ...extra },
    });
    expect(r.statusCode).toBe(200);
    const link = r.json() as { id: string; pin: string; url: string };
    const token = link.url.split('/convidado/')[1] ?? '';
    return { ...link, token };
  }

  it('cria com PIN próprio de 4 dígitos e persiste em arquivo', async () => {
    const m = await montar();
    const link = await criar(m);
    expect(link.pin).toMatch(/^\d{4}$/);
    expect(link.token).toMatch(/^[0-9a-f]{32}$/);
    const salvo = await carregarOuCriarConvidados(m.caminhoConvidados);
    expect(salvo.links).toHaveLength(1);
    expect(salvo.links[0]?.pin).toBe(link.pin);
  });

  it('entra com o PIN do link (não com o do hub) e respeita o completo do link', async () => {
    const m = await montar();
    const link = await criar(m);

    const errado = await m.app.inject({
      method: 'POST',
      url: ROTAS.convidadoEntrar,
      payload: { token: link.token, pin: '4321' },
    });
    expect(errado.statusCode).toBe(401);

    const cookie = await entrar(m.app, link.token, link.pin);
    expect((await agir(m.app, cookie, { modo: 'holyrics', acao: 'f9' })).statusCode).toBe(200);
  });

  it('link fixo sem completo só avança e volta', async () => {
    const m = await montar();
    const link = await criar(m, { completo: false });
    const cookie = await entrar(m.app, link.token, link.pin);
    expect((await agir(m.app, cookie, { modo: 'holyrics', acao: 'proximo' })).statusCode).toBe(200);
    expect((await agir(m.app, cookie, { modo: 'holyrics', acao: 'f10' })).statusCode).toBe(403);
  });

  it('trocar o PIN derruba os celulares desse link e não mexe nos outros', async () => {
    const m = await montar();
    const a = await criar(m, { nome: 'A' });
    const b = await criar(m, { nome: 'B' });
    const cookieA = await entrar(m.app, a.token, a.pin);
    const cookieB = await entrar(m.app, b.token, b.pin);

    const troca = await m.app.inject({ method: 'POST', url: ROTAS.convidadoFixosPin, payload: { id: a.id } });
    expect(troca.statusCode).toBe(200);
    expect(troca.json().pin).toMatch(/^\d{4}$/);

    expect((await agir(m.app, cookieA, { modo: 'holyrics', acao: 'proximo' })).statusCode).toBe(401);
    expect((await agir(m.app, cookieB, { modo: 'holyrics', acao: 'proximo' })).statusCode).toBe(200);

    // O PIN antigo não entra mais; o novo sim.
    const velho = await m.app.inject({ method: 'POST', url: ROTAS.convidadoEntrar, payload: { token: a.token, pin: a.pin } });
    if (troca.json().pin !== a.pin) expect(velho.statusCode).toBe(401);
    const novoCookie = await entrar(m.app, a.token, troca.json().pin);
    expect((await agir(m.app, novoCookie, { modo: 'holyrics', acao: 'proximo' })).statusCode).toBe(200);
  });

  it('excluir derruba o link', async () => {
    const m = await montar();
    const link = await criar(m);
    const cookie = await entrar(m.app, link.token, link.pin);
    await m.app.inject({ method: 'POST', url: ROTAS.convidadoFixosExcluir, payload: { id: link.id } });
    expect((await agir(m.app, cookie, { modo: 'holyrics', acao: 'proximo' })).statusCode).toBe(401);
    const entrada = await m.app.inject({ method: 'POST', url: ROTAS.convidadoEntrar, payload: { token: link.token, pin: link.pin } });
    expect(entrada.statusCode).toBe(404);
  });

  it('aplica o limite de tentativas de PIN também aos links fixos', async () => {
    const m = await montar();
    const link = await criar(m);
    let ultimo = 0;
    for (let i = 0; i < 12; i += 1) {
      const r = await m.app.inject({
        method: 'POST',
        url: ROTAS.convidadoEntrar,
        payload: { token: link.token, pin: '000000' },
      });
      ultimo = r.statusCode;
    }
    expect(ultimo).toBe(429);
  });

  it('setas em link fixo nunca é completo, mesmo pedindo', async () => {
    const m = await montar();
    const link = await criar(m, { modo: 'teclado', completo: true });
    const cookie = await entrar(m.app, link.token, link.pin);
    expect((await agir(m.app, cookie, { modo: 'teclado', acao: 'encerrar' })).statusCode).toBe(403);
  });

  it('um link fixo não vale para outro modo', async () => {
    const m = await montar();
    const link = await criar(m, { modo: 'holyrics' });
    const cookie = await entrar(m.app, link.token, link.pin);
    expect((await agir(m.app, cookie, { modo: 'teclado', acao: 'proximo' })).statusCode).toBe(403);
  });
});

describe('token da URL x cookie', () => {
  async function doisLinks() {
    const m = await montar();
    const criar = async (nome: string) => {
      const r = await m.app.inject({
        method: 'POST',
        url: ROTAS.convidadoFixos,
        payload: { nome, dispositivo: 'note', modo: 'holyrics', completo: false },
      });
      const l = r.json() as { pin: string; url: string };
      return { pin: l.pin, token: l.url.split('/convidado/')[1] ?? '' };
    };
    return { ...m, a: await criar('A'), b: await criar('B') };
  }
  const estado = (app: App, cookie: string, query: string) =>
    app.inject({ method: 'GET', url: `${ROTAS.convidadoEstado}${query}`, headers: { cookie } });

  it('cookie do A com token do B dá 401; com token do A passa; sem token passa (compat)', async () => {
    const { app, a, b } = await doisLinks();
    const cookieA = await entrar(app, a.token, a.pin);
    expect((await estado(app, cookieA, `?token=${b.token}`)).statusCode).toBe(401);
    expect((await estado(app, cookieA, `?token=${a.token}`)).statusCode).toBe(200);
    expect((await estado(app, cookieA, '')).statusCode).toBe(200);
    const acao = await app.inject({
      method: 'POST',
      url: `${ROTAS.convidadoAcao}?token=${b.token}`,
      headers: { cookie: cookieA },
      payload: { modo: 'holyrics', acao: 'proximo' },
    });
    expect(acao.statusCode).toBe(401);
  });

  it('entrar no B depois do A troca o cookie', async () => {
    const { app, a, b } = await doisLinks();
    await entrar(app, a.token, a.pin);
    const cookieB = await entrar(app, b.token, b.pin);
    expect((await estado(app, cookieB, `?token=${b.token}`)).statusCode).toBe(200);
    expect((await estado(app, cookieB, `?token=${a.token}`)).statusCode).toBe(401);
  });

  it('PIN errado na entrada responde "PIN incorreto."', async () => {
    const { app, a } = await doisLinks();
    const r = await app.inject({
      method: 'POST',
      url: ROTAS.convidadoEntrar,
      payload: { token: a.token, pin: a.pin === '0000' ? '1111' : '0000' },
    });
    expect(r.statusCode).toBe(401);
    expect(r.json().mensagem).toBe('PIN incorreto.');
  });
});
