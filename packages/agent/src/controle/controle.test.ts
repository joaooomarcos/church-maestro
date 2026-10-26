import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { CAMINHOS_CONTROLE_AGENTE, type ConfigAgente } from '@maestro/shared';
import { registrarTelaControle, type EstadoControle } from './index.js';

const config: ConfigAgente = {
  dispositivoId: 'fundo',
  porta: 8770,
  token: 'z'.repeat(16),
  intervaloHeartbeatMs: 10_000,
  caminhosApps: {},
  manterLigado: false,
};

function montar() {
  const app = Fastify();
  registrarTelaControle(app, config);
  return app;
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
});
