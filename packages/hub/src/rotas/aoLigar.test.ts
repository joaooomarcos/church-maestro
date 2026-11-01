import { describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { ROTAS, dispositivoConfigSchema, respostaAoLigarSchema, type RotinaAoLigar } from '@maestro/shared';
import { criarContexto } from './contexto.js';
import { registrarRotasMaquinas } from './maquinas.js';
import { Store } from '../estado/store.js';
import { ErroDriver, type Drivers } from '../drivers/tipos.js';

const rotina: RotinaAoLigar = {
  ativo: true,
  esperaSegundos: 30,
  passos: [{ tipo: 'app.acao', app: 'holyrics', acao: 'abrir', esperarPronto: true }],
};

async function montar(agente: Partial<Drivers['agente']>) {
  const pasta = await mkdtemp(path.join(tmpdir(), 'maestro-ao-ligar-'));
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
    drivers: { agente } as Drivers,
    store: new Store(),
    cenarios: [],
    dispositivos: [dispositivo],
    caminhoDispositivos: path.join(pasta, 'devices.json'),
    caminhoHub: path.join(pasta, 'hub.json'),
    caminhoConvidados: path.join(pasta, 'convidados.json'),
  });
  const app = Fastify();
  registrarRotasMaquinas(app, ctx);
  return app;
}

const url = (id: string, fim = '') => ROTAS.aoLigarDaMaquina.replace(':id', id) + fim;

describe('HUB-AL: rotina "ao ligar" editada pelo hub, guardada no agente', () => {
  it('HUB-AL-01: lê a rotina que está no agente da máquina', async () => {
    const resposta = respostaAoLigarSchema.parse({ rotina });
    const lerAoLigar = vi.fn(async () => resposta);
    const app = await montar({ lerAoLigar });
    const r = await app.inject({ method: 'GET', url: url('fundo') });
    expect(r.statusCode).toBe(200);
    expect(r.json().rotina).toEqual(rotina);
    expect(lerAoLigar).toHaveBeenCalledWith(expect.objectContaining({ id: 'fundo' }));
  });

  it('HUB-AL-02: grava pelo agente e devolve o que o agente devolveu', async () => {
    const salvarAoLigar = vi.fn(async (_d, r: RotinaAoLigar) => respostaAoLigarSchema.parse({ rotina: r }));
    const app = await montar({ salvarAoLigar });
    const r = await app.inject({ method: 'PUT', url: url('fundo'), payload: rotina });
    expect(r.statusCode).toBe(200);
    expect(salvarAoLigar).toHaveBeenCalledWith(expect.anything(), rotina);
    expect(r.json().rotina).toEqual(rotina);
  });

  it('HUB-AL-03: máquina desligada (agente não responde): 502 com a mensagem, e nada fica gravado no hub', async () => {
    const mensagem = 'O agente do PC Fundo não respondeu. A máquina pode estar desligada ou o agente não foi iniciado.';
    const erro = () => Promise.reject(new ErroDriver(mensagem));
    const app = await montar({ lerAoLigar: erro, salvarAoLigar: erro, testarAoLigar: erro });
    for (const [metodo, caminho] of [
      ['GET', url('fundo')],
      ['PUT', url('fundo')],
      ['POST', url('fundo', '/testar')],
    ] as const) {
      const r = await app.inject({ method: metodo, url: caminho, ...(metodo === 'PUT' ? { payload: rotina } : {}) });
      expect(r.statusCode).toBe(502);
      expect(r.json().mensagem).toBe(mensagem);
    }
  });

  it('HUB-AL-04: rotina inválida é recusada antes de chegar ao agente', async () => {
    const salvarAoLigar = vi.fn();
    const app = await montar({ salvarAoLigar });
    const r = await app.inject({
      method: 'PUT',
      url: url('fundo'),
      payload: { ativo: true, passos: [{ tipo: 'espera', ms: -5 }] },
    });
    expect(r.statusCode).toBe(400);
    expect(salvarAoLigar).not.toHaveBeenCalled();
  });

  it('HUB-AL-05: máquina que não existe: 404', async () => {
    const app = await montar({});
    for (const [metodo, caminho] of [
      ['GET', url('nada')],
      ['PUT', url('nada')],
      ['POST', url('nada', '/testar')],
    ] as const) {
      const r = await app.inject({ method: metodo, url: caminho, ...(metodo === 'PUT' ? { payload: rotina } : {}) });
      expect(r.statusCode).toBe(404);
    }
  });

  it('HUB-AL-06: "testar" manda o agente rodar e responde 202 na hora', async () => {
    const testarAoLigar = vi.fn(async () => {});
    const app = await montar({ testarAoLigar });
    const r = await app.inject({ method: 'POST', url: url('fundo', '/testar') });
    expect(r.statusCode).toBe(202);
    expect(testarAoLigar).toHaveBeenCalledOnce();
  });
});
