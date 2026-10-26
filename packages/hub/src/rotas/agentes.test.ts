import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import {
  ROTAS,
  dispositivoConfigSchema,
  linkFixoConvidadoSchema,
  pinDoEndereco,
  respostaControleAgenteSchema,
} from '@maestro/shared';
import { criarContexto } from './contexto.js';
import { registrarRotasAgentes } from './agentes.js';
import { Store } from '../estado/store.js';
import type { Drivers } from '../drivers/tipos.js';

const TOKEN_AGENTES = 'y'.repeat(16);

async function montar() {
  const pasta = await mkdtemp(path.join(tmpdir(), 'maestro-agentes-'));
  const dispositivo = dispositivoConfigSchema.parse({
    id: 'fundo',
    nome: 'PC Fundo',
    host: '10.0.0.7',
    servicos: { agente: { porta: 8770 }, ndiMonitor: { portas: [80, 81] } },
  });
  const ctx = criarContexto({
    config: {
      porta: 8700,
      pin: '1234',
      segredoSessao: 'x'.repeat(16),
      tokenAgentes: TOKEN_AGENTES,
      intervaloHeartbeatMs: 10_000,
      pinConvidado: '4321',
      intervaloPollingMs: 2000,
      varreduraAutomaticaMin: 10,
    },
    drivers: {} as Drivers,
    store: new Store(),
    cenarios: [],
    dispositivos: [dispositivo],
    caminhoDispositivos: path.join(pasta, 'devices.json'),
    caminhoHub: path.join(pasta, 'hub.json'),
    caminhoConvidados: path.join(pasta, 'convidados.json'),
  });
  const link = (id: string, dispositivo: string) =>
    linkFixoConvidadoSchema.parse({
      id,
      nome: `Link ${id}`,
      token: `token-${id}-xxxxxxxx`,
      dispositivo,
      modo: 'holyrics',
      pin: '2468',
      versaoPin: 'versao-1234',
    });
  await ctx.salvarLinkConvidado(link('a', 'fundo'));
  await ctx.salvarLinkConvidado(link('b', 'outra'));
  const app = Fastify();
  registrarRotasAgentes(app, ctx);
  return app;
}

describe('controle do agente', () => {
  it('recusa sem o token dos agentes', async () => {
    const app = await montar();
    const resposta = await app.inject({ method: 'GET', url: `${ROTAS.controleAgente}?dispositivo=fundo` });
    expect(resposta.statusCode).toBe(401);
  });

  it('devolve só os links desta máquina, com o PIN no endereço, e as portas do NDI', async () => {
    const app = await montar();
    const resposta = await app.inject({
      method: 'GET',
      url: `${ROTAS.controleAgente}?dispositivo=fundo`,
      headers: { 'x-maestro-token': TOKEN_AGENTES },
    });
    expect(resposta.statusCode).toBe(200);
    const corpo = respostaControleAgenteSchema.parse(resposta.json());
    expect(corpo.dispositivoNome).toBe('PC Fundo');
    expect(corpo.portasNdi).toEqual([80, 81]);
    // Sem Holyrics cadastrado, nada de token para o modo solo.
    expect(corpo.holyrics).toBeNull();
    expect(corpo.links.map((l) => l.id)).toEqual(['a']);
    const url = new URL(corpo.links[0]!.url);
    expect(url.pathname).toBe('/convidado/token-a-xxxxxxxx');
    expect(pinDoEndereco(url.hash)).toBe('2468');
  });

  it('máquina desconhecida dá 404', async () => {
    const app = await montar();
    const resposta = await app.inject({
      method: 'GET',
      url: `${ROTAS.controleAgente}?dispositivo=nada`,
      headers: { 'x-maestro-token': TOKEN_AGENTES },
    });
    expect(resposta.statusCode).toBe(404);
  });
});
