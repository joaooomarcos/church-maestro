import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { CAMINHOS_AO_LIGAR, rotinaAoLigarSchema, type PassoAoLigar, type RotinaAoLigar } from '@maestro/shared';
import {
  AUSENCIA_LONGA_MS,
  AUSENCIA_MINIMA_MS,
  UPTIME_RECENTE_S,
  criarServicoAoLigar,
  pareceLigacao,
  type ArmazemEstado,
  type EstadoAnotado,
} from './index.js';
import { registrarRotasAoLigar } from './rotas.js';
import { executarPassos, type DependenciasRotina } from './passos.js';
import { SCRIPT, urlSegura } from './navegador.js';

const MIN = 60_000;

function deps(extra: Partial<DependenciasRotina> = {}) {
  let relogio = 1_000_000;
  const chamadas: string[] = [];
  const base: DependenciasRotina = {
    acaoApp: vi.fn(async (app, acao) => void chamadas.push(`app:${app}:${acao}`)),
    aviso: vi.fn(async (c) => void chamadas.push(`aviso:${c.mensagem}`)),
    ndi: vi.fn(async (porta, fonte) => void chamadas.push(`ndi:${porta}:${fonte}`)),
    abrirPagina: vi.fn(async (url) => void chamadas.push(`pagina:${url}`)),
    holyrics: vi.fn(async (acao) => void chamadas.push(`holyrics:${acao}`)),
    appPronto: vi.fn(async () => true),
    dormir: vi.fn(async (ms) => {
      relogio += ms;
    }),
    agora: () => relogio,
  };
  return { ...base, ...extra, chamadas };
}

function armazemEmMemoria(inicial: EstadoAnotado = {}): ArmazemEstado & { dados: EstadoAnotado } {
  const armazem = {
    dados: { ...inicial },
    async ler() {
      return armazem.dados;
    },
    async gravar(mudanca: Partial<EstadoAnotado>) {
      armazem.dados = { ...armazem.dados, ...mudanca };
    },
  };
  return armazem;
}

const abrirHolyrics: PassoAoLigar = { tipo: 'app.acao', app: 'holyrics', acao: 'abrir' };
const rotinaAtiva: RotinaAoLigar = { ativo: true, esperaSegundos: 5, passos: [abrirHolyrics] };

describe('AL-DET: quando a máquina "ligou"', () => {
  const agora = 10 * 60 * 60_000;

  it('AL-DET-01: sem anotação anterior (primeira vez do agente) nunca é ligação', () => {
    expect(pareceLigacao({ vivoEm: undefined, agora, uptimeS: 5 })).toBe(false);
  });

  it('AL-DET-02: reinício curto do agente (atualização, queda) não é ligação, mesmo com o Windows recém-subido', () => {
    expect(pareceLigacao({ vivoEm: agora - (AUSENCIA_MINIMA_MS - 1), agora, uptimeS: 5 })).toBe(false);
  });

  it('AL-DET-03: ausência média com o Windows ligado há horas é queda do agente, não ligação', () => {
    expect(pareceLigacao({ vivoEm: agora - 10 * MIN, agora, uptimeS: UPTIME_RECENTE_S * 10 })).toBe(false);
  });

  it('AL-DET-04: ausência média com o Windows recém-subido é ligação', () => {
    expect(pareceLigacao({ vivoEm: agora - 10 * MIN, agora, uptimeS: 90 })).toBe(true);
  });

  it('AL-DET-05: ausência longa é ligação mesmo que o uptime não tenha zerado (inicialização rápida do Windows)', () => {
    expect(pareceLigacao({ vivoEm: agora - AUSENCIA_LONGA_MS, agora, uptimeS: 7 * 24 * 3600 })).toBe(true);
  });

  it('AL-DET-06: relógio que andou para trás não é ligação', () => {
    expect(pareceLigacao({ vivoEm: agora + 5 * MIN, agora, uptimeS: 5 })).toBe(false);
  });
});

describe('AL-PASSOS: execução dos passos', () => {
  it('AL-PASSOS-01: roda os passos em ordem e marca sucesso', async () => {
    const d = deps();
    const r = await executarPassos(
      [abrirHolyrics, { tipo: 'ndi.definirFonte', porta: 80, fonte: 'CAMERA' }, { tipo: 'holyrics.f8', ativar: true }],
      d,
      'teste',
    );
    expect(r.ok).toBe(true);
    expect(d.chamadas).toEqual(['app:holyrics:abrir', 'ndi:80:CAMERA', 'holyrics:SetF8']);
    expect(d.holyrics).toHaveBeenCalledWith('SetF8', { enable: true });
  });

  it('AL-PASSOS-02: um passo que falha não impede os seguintes', async () => {
    const d = deps({ ndi: vi.fn(async () => Promise.reject(new Error('Studio Monitor fechado'))) });
    const r = await executarPassos(
      [{ tipo: 'ndi.definirFonte', porta: 80, fonte: null }, { tipo: 'aviso', mensagem: 'oi', segundos: null }],
      d,
      'boot',
    );
    expect(r.ok).toBe(false);
    expect(r.passos.map((p) => p.ok)).toEqual([false, true]);
    expect(r.passos[0]?.erro).toBe('Studio Monitor fechado');
    expect(d.chamadas).toEqual(['aviso:oi']);
  });

  it('AL-PASSOS-03: "esperar ficar pronto" que estoura pula o resto da rotina', async () => {
    const d = deps({ appPronto: vi.fn(async () => false) });
    const r = await executarPassos(
      [
        { tipo: 'app.acao', app: 'holyrics', acao: 'abrir', esperarPronto: true, esperaMaxSegundos: 5 },
        { tipo: 'holyrics.f8', ativar: true },
        { tipo: 'aviso', mensagem: 'pronto', segundos: null },
      ],
      d,
      'boot',
    );
    expect(r.passos.map((p) => [p.ok, p.pulado ?? false])).toEqual([
      [false, false],
      [false, true],
      [false, true],
    ]);
    expect(r.passos[0]?.erro).toMatch(/não ficou pronto em 5 s/);
    expect(d.holyrics).not.toHaveBeenCalled();
  });

  it('AL-PASSOS-04: "esperar ficar pronto" segue quando o programa responde depois de algumas tentativas', async () => {
    let tentativas = 0;
    const d = deps({ appPronto: vi.fn(async () => ++tentativas >= 3) });
    const r = await executarPassos(
      [{ tipo: 'app.acao', app: 'holyrics', acao: 'abrir', esperarPronto: true }, { tipo: 'holyrics.f8', ativar: false }],
      d,
      'boot',
    );
    expect(r.ok).toBe(true);
    expect(tentativas).toBe(3);
  });

  it('AL-PASSOS-05: "esperar ficar pronto" é ignorado em ações que não abrem o programa', async () => {
    const d = deps({ appPronto: vi.fn(async () => false) });
    const r = await executarPassos([{ tipo: 'app.acao', app: 'obs', acao: 'fechar', esperarPronto: true }], d, 'teste');
    expect(r.ok).toBe(true);
    expect(d.appPronto).not.toHaveBeenCalled();
  });
});

describe('AL-CHROME: passo que abre uma página', () => {
  it('AL-CHROME-01: o passo abre o endereço pedido', async () => {
    const d = deps();
    const r = await executarPassos([{ tipo: 'chrome.abrir', url: 'https://exemplo.com/culto?a=1&b=2' }], d, 'teste');
    expect(r.ok).toBe(true);
    expect(d.chamadas).toEqual(['pagina:https://exemplo.com/culto?a=1&b=2']);
    expect(r.passos[0]?.descricao).toBe('Abrir no Chrome: https://exemplo.com/culto?a=1&b=2');
  });

  it('AL-CHROME-03: espaço e aspas na URL não viram argumento do Chrome', () => {
    expect(urlSegura('https://exemplo.com/a --disable-web-security "b"')).toBe(
      'https://exemplo.com/a%20--disable-web-security%20%22b%22',
    );
    expect(() => urlSegura('file:///C:/Windows/notepad.exe')).toThrow();
  });

  it('AL-CHROME-02: só aceita endereço http(s)', () => {
    for (const url of ['file:///C:/Windows/notepad.exe', 'javascript:alert(1)', 'youtube.com', '']) {
      expect(rotinaAoLigarSchema.safeParse({ passos: [{ tipo: 'chrome.abrir', url }] }).success, url).toBe(false);
    }
    expect(rotinaAoLigarSchema.safeParse({ passos: [{ tipo: 'chrome.abrir', url: 'https://youtube.com' }] }).success).toBe(true);
  });

  it('AL-CHROME-04: o script do PowerShell não tem ";" entre o try e o catch', () => {
    expect(SCRIPT).not.toMatch(/\}\s*;\s*catch/);
    expect(SCRIPT).toMatch(/try \{.*\} catch \{/);
  });
});

describe('AL-BOOT: o agente dispara a rotina ao subir', () => {
  afterEach(() => vi.useRealTimers());

  async function subir(opcoes: { vivoEm: number | undefined; uptimeS: number; rotina?: RotinaAoLigar }) {
    vi.useFakeTimers();
    const d = deps({ agora: () => Date.now() });
    const armazem = armazemEmMemoria(opcoes.vivoEm === undefined ? {} : { vivoEm: opcoes.vivoEm });
    const servico = criarServicoAoLigar({
      rotina: opcoes.rotina ?? rotinaAtiva,
      deps: d,
      armazem,
      gravarRotina: async () => {},
      uptimeS: () => opcoes.uptimeS,
    });
    await servico.iniciar();
    return { d, armazem, servico };
  }

  it('AL-BOOT-01: máquina que ligou roda a rotina depois da espera, e registra a execução', async () => {
    const { d, armazem, servico } = await subir({ vivoEm: Date.now() - 3 * 60 * MIN, uptimeS: 60 });
    expect(d.acaoApp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(d.acaoApp).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(d.acaoApp).toHaveBeenCalledWith('holyrics', 'abrir');
    expect(armazem.dados.ultimaExecucaoAoLigar).toMatchObject({ origem: 'boot', ok: true });
    servico.parar();
  });

  it('AL-BOOT-06: se a rotina do boot falhar, abre a tela de controle para mostrar o que deu errado', async () => {
    vi.useFakeTimers();
    const d = deps({ agora: () => Date.now(), acaoApp: vi.fn(async () => { throw new Error('Holyrics não instalado'); }) });
    const servico = criarServicoAoLigar({
      rotina: rotinaAtiva,
      deps: d,
      armazem: armazemEmMemoria({ vivoEm: Date.now() - 3 * 60 * MIN }),
      gravarRotina: async () => {},
      uptimeS: () => 60,
      urlControle: 'http://localhost:8790/controle',
    });
    await servico.iniciar();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(d.abrirPagina).toHaveBeenCalledWith('http://localhost:8790/controle#ao-ligar');
    servico.parar();
  });

  it('AL-BOOT-07: rotina do boot que deu certo não abre a tela de controle', async () => {
    vi.useFakeTimers();
    const d = deps({ agora: () => Date.now() });
    const servico = criarServicoAoLigar({
      rotina: rotinaAtiva,
      deps: d,
      armazem: armazemEmMemoria({ vivoEm: Date.now() - 3 * 60 * MIN }),
      gravarRotina: async () => {},
      uptimeS: () => 60,
      urlControle: 'http://localhost:8790/controle',
    });
    await servico.iniciar();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(d.abrirPagina).not.toHaveBeenCalled();
    servico.parar();
  });

  it('AL-BOOT-02: reinício do agente com a máquina já ligada não roda nada', async () => {
    const { d, servico } = await subir({ vivoEm: Date.now() - 20_000, uptimeS: 5 * 3600 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.acaoApp).not.toHaveBeenCalled();
    servico.parar();
  });

  it('AL-BOOT-03: rotina desligada não roda no boot', async () => {
    const { d, servico } = await subir({
      vivoEm: Date.now() - 3 * 60 * MIN,
      uptimeS: 60,
      rotina: { ...rotinaAtiva, ativo: false },
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.acaoApp).not.toHaveBeenCalled();
    servico.parar();
  });

  it('AL-BOOT-04: desligar a rotina durante a espera cancela a execução', async () => {
    const { d, servico } = await subir({ vivoEm: Date.now() - 3 * 60 * MIN, uptimeS: 60 });
    await servico.salvar({ ...rotinaAtiva, ativo: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.acaoApp).not.toHaveBeenCalled();
    servico.parar();
  });

  it('AL-BOOT-05: encerrar o agente durante a espera cancela a execução', async () => {
    const { d, servico } = await subir({ vivoEm: Date.now() - 3 * 60 * MIN, uptimeS: 60 });
    servico.parar();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.acaoApp).not.toHaveBeenCalled();
  });

  it('AL-BOOT-06: primeira execução do agente (sem anotação) não roda e passa a anotar que está vivo', async () => {
    const { d, armazem, servico } = await subir({ vivoEm: undefined, uptimeS: 30 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.acaoApp).not.toHaveBeenCalled();
    expect(armazem.dados.vivoEm).toBeDefined();
    servico.parar();
  });

  it('AL-BOOT-07: anota que está vivo a cada intervalo', async () => {
    const { armazem, servico } = await subir({ vivoEm: undefined, uptimeS: 30 });
    const primeiro = armazem.dados.vivoEm ?? 0;
    await vi.advanceTimersByTimeAsync(31_000);
    expect(armazem.dados.vivoEm).toBeGreaterThan(primeiro);
    servico.parar();
  });
});

describe('AL-API: rotina servida pelo agente', () => {
  function montar(token?: string) {
    const d = deps();
    const gravadas: RotinaAoLigar[] = [];
    const servico = criarServicoAoLigar({
      rotina: undefined,
      deps: d,
      armazem: armazemEmMemoria(),
      gravarRotina: async (r) => void gravadas.push(r),
      uptimeS: () => 100,
    });
    const app = Fastify();
    registrarRotasAoLigar(app, servico, CAMINHOS_AO_LIGAR, (req, reply, done) => {
      if (token && req.headers['x-maestro-token'] !== token) {
        reply.code(401).send({ erro: 'nao-autorizado' });
        return;
      }
      done();
    });
    return { app, d, gravadas };
  }

  it('AL-API-01: sem rotina salva devolve uma rotina vazia e desligada', async () => {
    const { app } = montar();
    const r = await app.inject({ method: 'GET', url: CAMINHOS_AO_LIGAR.rotina });
    expect(r.json()).toMatchObject({ rotina: { ativo: false, passos: [] }, ultimaExecucao: null, executando: false });
  });

  it('AL-API-02: salvar grava e devolve o que ficou', async () => {
    const { app, gravadas } = montar();
    const r = await app.inject({ method: 'PUT', url: CAMINHOS_AO_LIGAR.rotina, payload: rotinaAtiva });
    expect(r.statusCode).toBe(200);
    expect(gravadas).toHaveLength(1);
    expect(rotinaAoLigarSchema.parse(r.json().rotina)).toEqual(rotinaAtiva);
  });

  it('AL-API-03: rotina inválida é recusada sem gravar', async () => {
    const { app, gravadas } = montar();
    const r = await app.inject({
      method: 'PUT',
      url: CAMINHOS_AO_LIGAR.rotina,
      payload: { ativo: true, passos: [{ tipo: 'aviso', mensagem: '   ' }] },
    });
    expect(r.statusCode).toBe(400);
    expect(gravadas).toHaveLength(0);
  });

  it('AL-API-04: "testar" começa na hora, sem esperar, e o resultado aparece no estado', async () => {
    const { app, d } = montar();
    await app.inject({ method: 'PUT', url: CAMINHOS_AO_LIGAR.rotina, payload: rotinaAtiva });
    const r = await app.inject({ method: 'POST', url: CAMINHOS_AO_LIGAR.testar });
    expect(r.statusCode).toBe(202);
    await vi.waitFor(async () => {
      const estado = await app.inject({ method: 'GET', url: CAMINHOS_AO_LIGAR.rotina });
      expect(estado.json()).toMatchObject({ executando: false, ultimaExecucao: { origem: 'teste', ok: true } });
    });
    expect(d.acaoApp).toHaveBeenCalledOnce();
  });

  it('AL-API-05: duas execuções ao mesmo tempo: a segunda é recusada com 409', async () => {
    let liberar: () => void = () => {};
    const travado = new Promise<void>((resolver) => (liberar = resolver));
    const d = deps({ acaoApp: vi.fn(() => travado) });
    const servico = criarServicoAoLigar({
      rotina: rotinaAtiva,
      deps: d,
      armazem: armazemEmMemoria(),
      gravarRotina: async () => {},
      uptimeS: () => 100,
    });
    const app = Fastify();
    registrarRotasAoLigar(app, servico, CAMINHOS_AO_LIGAR, (_q, _r, done) => done());
    expect((await app.inject({ method: 'POST', url: CAMINHOS_AO_LIGAR.testar })).statusCode).toBe(202);
    expect((await app.inject({ method: 'GET', url: CAMINHOS_AO_LIGAR.rotina })).json().executando).toBe(true);
    expect((await app.inject({ method: 'POST', url: CAMINHOS_AO_LIGAR.testar })).statusCode).toBe(409);
    liberar();
    await vi.waitFor(async () => {
      expect((await app.inject({ method: 'GET', url: CAMINHOS_AO_LIGAR.rotina })).json().executando).toBe(false);
    });
  });

  it('AL-API-06: com token exigido, sem token é 401 e nada é lido nem gravado', async () => {
    const { app, gravadas } = montar('segredo-longo');
    expect((await app.inject({ method: 'GET', url: CAMINHOS_AO_LIGAR.rotina })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'PUT', url: CAMINHOS_AO_LIGAR.rotina, payload: rotinaAtiva })).statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'POST', url: CAMINHOS_AO_LIGAR.testar })).statusCode).toBe(401);
    expect(gravadas).toHaveLength(0);
  });
});
