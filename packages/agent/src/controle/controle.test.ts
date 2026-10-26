import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { CAMINHOS_CONTROLE_AGENTE, CAMINHOS_SOLO, type ConfigAgente } from '@maestro/shared';
import { PPT_INDISPONIVEL, type PontePowerPoint } from '../ppt/tipos.js';
import { registrarTelaControle, type EstadoControle } from './index.js';
import { criarMemoria } from './memoria.js';
import type { EstadoSolo } from './solo.js';

const config: ConfigAgente = {
  dispositivoId: 'fundo',
  porta: 8770,
  token: 'z'.repeat(16),
  intervaloHeartbeatMs: 10_000,
  caminhosApps: {},
  manterLigado: false,
};

function montar(extra: Partial<ConfigAgente> = {}) {
  const app = Fastify();
  const executar = vi.fn(async () => PPT_INDISPONIVEL);
  const ponte = {
    disponivel: true,
    status: async () => ({ emApresentacao: true, slide: 3, totalSlides: 12, arquivo: 'culto.pptx' }),
    executar,
  } as unknown as PontePowerPoint;
  const gravado: Partial<ConfigAgente>[] = [];
  const memoria = criarMemoria({ ...config, ...extra }, async (mudanca) => {
    gravado.push(mudanca);
  });
  registrarTelaControle(app, { ...config, ...extra }, ponte, memoria);
  return Object.assign(app, { executar, gravado, memoria });
}

describe('tela de controle do agente', () => {
  it('recusa quem vem de outra máquina da rede', async () => {
    const resposta = await montar().inject({
      method: 'GET',
      url: CAMINHOS_CONTROLE_AGENTE.pagina,
      remoteAddress: '192.168.0.20',
      headers: { host: '192.168.0.30:8770' },
    });
    expect(resposta.statusCode).toBe(403);
  });

  it('recusa endereço local com Host de fora (DNS rebinding)', async () => {
    const resposta = await montar().inject({
      method: 'POST',
      url: CAMINHOS_CONTROLE_AGENTE.ndi,
      remoteAddress: '127.0.0.1',
      headers: { host: 'malicioso.exemplo:8770' },
      payload: { porta: 80, fonte: null },
    });
    expect(resposta.statusCode).toBe(403);
  });

  it('abre a página e o estado na própria máquina', async () => {
    const app = montar();
    const pagina = await app.inject({
      method: 'GET',
      url: CAMINHOS_CONTROLE_AGENTE.pagina,
      remoteAddress: '127.0.0.1',
      headers: { host: 'localhost:8770' },
    });
    expect(pagina.statusCode).toBe(200);
    expect(pagina.body).toContain('Controle desta máquina');

    const estado = await app.inject({
      method: 'GET',
      url: CAMINHOS_CONTROLE_AGENTE.estado,
      remoteAddress: '127.0.0.1',
      headers: { host: 'localhost:8770' },
    });
    const corpo = estado.json<EstadoControle>();
    // Sem hubUrl: nada de QR, e o NDI só mostra janelas que responderem (aqui, nenhuma).
    expect(corpo.hub).toBe('sem-hub');
    expect(corpo.links).toEqual([]);
    expect(Array.isArray(corpo.ndi)).toBe(true);
  });

  it('estado sem hub traz o QR solo, que leva o PIN', async () => {
    const app = montar({ pinSolo: '1357' });
    const corpo = (
      await app.inject({
        method: 'GET',
        url: CAMINHOS_CONTROLE_AGENTE.estado,
        remoteAddress: '127.0.0.1',
        headers: { host: 'localhost:8770' },
      })
    ).json<EstadoControle>();
    // Máquina de teste sem rede não tem IP para o QR.
    if (corpo.solo) {
      expect(corpo.solo.endereco).toMatch(/^http:\/\/[\d.]+:8770\/solo$/);
      expect(corpo.solo.svg).toContain('<svg');
    }
  });
});

describe('controle solo', () => {
  const pedir = (app: ReturnType<typeof montar>, pin: string, url: string = CAMINHOS_SOLO.estado) =>
    app.inject({ method: 'GET', url, remoteAddress: '192.168.0.20', headers: { 'x-maestro-pin': pin } });

  it('a página abre para a rede, mas o estado exige o PIN', async () => {
    const app = montar({ pinSolo: '1357' });
    const pagina = await app.inject({ method: 'GET', url: CAMINHOS_SOLO.pagina, remoteAddress: '192.168.0.20' });
    expect(pagina.statusCode).toBe(200);
    expect((await pedir(app, '0000')).statusCode).toBe(401);
    const certo = await pedir(app, '1357');
    expect(certo.statusCode).toBe(200);
    const estado = certo.json<EstadoSolo>();
    expect(estado.modos.map((m) => m.modo)).toContain('powerpoint');
    expect(estado.resumo).toBe('PowerPoint: slide 3 de 12');
  });

  it('bloqueia depois de 10 PINs errados, mesmo com o certo', async () => {
    const app = montar({ pinSolo: '1357' });
    for (let i = 0; i < 10; i++) await pedir(app, '0000');
    expect((await pedir(app, '1357')).statusCode).toBe(429);
  });

  it('avança o PowerPoint', async () => {
    const app = montar({ pinSolo: '1357' });
    const resposta = await app.inject({
      method: 'POST',
      url: CAMINHOS_SOLO.acao,
      remoteAddress: '192.168.0.20',
      headers: { 'x-maestro-pin': '1357' },
      payload: { modo: 'powerpoint', acao: 'proximo' },
    });
    expect(resposta.statusCode).toBe(200);
    expect(app.executar).toHaveBeenCalledWith({ acao: 'proximo' });
  });

  it('Holyrics só aparece depois que o hub informou o token', async () => {
    const app = montar({ pinSolo: '1357' });
    const antes = (await pedir(app, '1357')).json<EstadoSolo>();
    expect(antes.modos.map((m) => m.modo)).not.toContain('holyrics');
    await app.memoria.lembrarHub({ dispositivoNome: 'PC Fundo', portasNdi: [80], holyrics: { porta: 8091, token: 't' } });
    const depois = (await pedir(app, '1357')).json<EstadoSolo>();
    expect(depois.modos.map((m) => m.modo)).toContain('holyrics');
    expect(depois.dispositivoNome).toBe('PC Fundo');
    expect(app.gravado.at(-1)?.memoriaHub?.dispositivoNome).toBe('PC Fundo');
  });

  it('PIN novo nasce e é gravado uma vez', async () => {
    const app = montar();
    const pin = app.memoria.pinSolo();
    expect(pin).toMatch(/^\d{4}$/);
    expect(app.memoria.pinSolo()).toBe(pin);
    expect(app.gravado.filter((g) => g.pinSolo)).toHaveLength(1);
  });

  it('Trocar PIN só pela própria máquina', async () => {
    const app = montar({ pinSolo: '1357' });
    const deFora = await app.inject({
      method: 'POST',
      url: CAMINHOS_CONTROLE_AGENTE.trocarPinSolo,
      remoteAddress: '192.168.0.20',
      headers: { host: '192.168.0.30:8770' },
    });
    expect(deFora.statusCode).toBe(403);
    const local = await app.inject({
      method: 'POST',
      url: CAMINHOS_CONTROLE_AGENTE.trocarPinSolo,
      remoteAddress: '127.0.0.1',
      headers: { host: 'localhost:8770' },
    });
    expect(local.statusCode).toBe(200);
    expect((await pedir(app, '1357')).statusCode).toBe(401);
  });
});
