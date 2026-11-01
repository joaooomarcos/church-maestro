import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { ROTAS, dispositivoConfigSchema } from '@maestro/shared';
import { criarContexto } from './contexto.js';
import { registrarRotasApps } from './apps.js';
import { Store } from '../estado/store.js';
import { ErroDriver, type Drivers } from '../drivers/tipos.js';

function montar(abrirUrl: Drivers['agente']['abrirUrl']) {
  const dispositivo = dispositivoConfigSchema.parse({
    id: 'fundo',
    nome: 'PC Fundo',
    host: '10.0.0.7',
    servicos: { agente: { porta: 8770 } },
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
    drivers: { agente: { abrirUrl } } as unknown as Drivers,
    store: new Store(),
    cenarios: [],
    dispositivos: [dispositivo],
    caminhoDispositivos: '/nao-grava',
    caminhoHub: '/nao-grava',
    persistir: false,
  });
  const app = Fastify();
  registrarRotasApps(app, ctx);
  return app;
}

describe('POST appUrl', () => {
  it('manda o endereço para o agente da máquina', async () => {
    const abrirUrl = vi.fn(async () => {});
    const resposta = await montar(abrirUrl).inject({
      method: 'POST',
      url: ROTAS.appUrl,
      payload: { dispositivo: 'fundo', url: 'https://youtube.com' },
    });
    expect(resposta.statusCode).toBe(200);
    expect(abrirUrl).toHaveBeenCalledWith(expect.objectContaining({ id: 'fundo' }), 'https://youtube.com');
  });

  it('recusa o que não for http(s) sem chamar o agente', async () => {
    const abrirUrl = vi.fn(async () => {});
    const resposta = await montar(abrirUrl).inject({
      method: 'POST',
      url: ROTAS.appUrl,
      payload: { dispositivo: 'fundo', url: 'file:///C:/Windows/notepad.exe' },
    });
    expect(resposta.statusCode).toBe(400);
    expect(abrirUrl).not.toHaveBeenCalled();
  });

  it('máquina desconhecida não chama o agente', async () => {
    const abrirUrl = vi.fn(async () => {});
    const resposta = await montar(abrirUrl).inject({
      method: 'POST',
      url: ROTAS.appUrl,
      payload: { dispositivo: 'outra', url: 'https://youtube.com' },
    });
    expect(resposta.statusCode).toBe(404);
    expect(abrirUrl).not.toHaveBeenCalled();
  });

  it('erro do agente sobe em português', async () => {
    const resposta = await montar(async () => {
      throw new ErroDriver('Não consegui abrir a página nesta máquina.');
    }).inject({ method: 'POST', url: ROTAS.appUrl, payload: { dispositivo: 'fundo', url: 'https://youtube.com' } });
    expect(resposta.statusCode).toBe(502);
    expect(resposta.json().mensagem).toBe('Não consegui abrir a página nesta máquina.');
  });
});
