import { describe, it, expect, vi } from 'vitest';
import type { DispositivoConfig } from '@maestro/shared';
import { checarLegendas, conferirGatilhos } from './legendas.js';
import type { ContextoCheck, OpcoesCheckLegendas } from './tipos.js';
import type { Drivers } from '../drivers/tipos.js';
import { criarDriversMock, dispositivosDemo } from '../drivers/mock.js';

/**
 * Os testes rodam sobre os drivers de demonstração (a mesma montagem da
 * igreja: Cena_Elementos com os grupos de música e leitura, dois Holyrics e a
 * fonte "holyrics2_biblia" começando velha), trocando só o que cada caso precisa.
 */

/** Esperas curtas: o que se testa aqui é a lógica, não o relógio. Segunda-feira, fora do horário proibido. */
const RAPIDO: OpcoesCheckLegendas = {
  esperaRenderizacaoMs: 2,
  esperaReferenciaMs: 2,
  esperaGrupoMs: 30,
  intervaloGrupoMs: 2,
  agora: () => new Date(2026, 9, 5, 15, 0),
};

const obsDe = (dispositivos: DispositivoConfig[]) => dispositivos.find((d) => d.id === 'pc-transmissao') as DispositivoConfig;
const porId = (dispositivos: DispositivoConfig[], id: string) => dispositivos.find((d) => d.id === id) as DispositivoConfig;

/** O cenário "antes do culto": OBS fora do ar e nada no ar nos Holyrics. */
async function preparar(dispositivos: DispositivoConfig[] = dispositivosDemo()): Promise<{
  ctx: ContextoCheck;
  drivers: Drivers;
  dispositivos: DispositivoConfig[];
}> {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const drivers = criarDriversMock();
  const lerObs = drivers.obs.ler.bind(drivers.obs);
  drivers.obs.ler = async (d) => ({ ...(await lerObs(d)), transmitindo: false, gravando: false });
  for (const d of dispositivos.filter((x) => x.servicos.holyrics)) {
    await drivers.holyrics.encerrarApresentacao(d);
  }
  return { ctx: { drivers, dispositivos: () => dispositivos }, drivers, dispositivos };
}

const passo = (r: Awaited<ReturnType<typeof checarLegendas>>, id: string) => r.passos.find((p) => p.id === id);

describe('checarLegendas', () => {
  it('testa música e leitura dos dois Holyrics e aponta a fonte vazia com o botão de atualizar', async () => {
    const { ctx } = await preparar();
    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('falha');
    expect(passo(r, 'note-frente:musica')?.status).toBe('ok');
    expect(passo(r, 'note-frente:leitura')?.status).toBe('ok');
    expect(passo(r, 'pc-fundo:musica')?.status).toBe('ok');
    const leitura = passo(r, 'pc-fundo:leitura');
    expect(leitura?.status).toBe('falha');
    expect(leitura?.comoResolver).toMatch(/atualize a fonte web "holyrics2_biblia"/);
    expect(leitura?.comoResolver).toMatch(/Holyrics é aberto depois do OBS/);
    expect(leitura?.acao).toEqual({
      tipo: 'atualizar-fonte-obs',
      dispositivo: 'pc-transmissao',
      fonte: 'holyrics2_biblia',
      holyrics: 'pc-fundo',
      rotulo: 'Atualizar fonte',
    });
    expect(r.resumo).toMatch(/holyrics2_biblia/);
  });

  it('passa inteiro depois de atualizar a fonte', async () => {
    const { ctx, drivers, dispositivos } = await preparar();
    await drivers.obs.atualizarFonte(obsDe(dispositivos), 'holyrics2_biblia');
    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('ok');
    expect(r.resumo).toBe('As 4 legendas testadas estão chegando no OBS.');
    expect(r.passos.filter((p) => p.grupo === 'Note Frente').length).toBeGreaterThan(0);
  });

  it('sempre encerra a apresentação e deixa os grupos fechados', async () => {
    const { ctx, drivers, dispositivos } = await preparar();
    await checarLegendas(ctx, RAPIDO);

    for (const id of ['note-frente', 'pc-fundo']) {
      expect((await drivers.holyrics.ler(porId(dispositivos, id))).apresentacao).toBeNull();
    }
    const obs = obsDe(dispositivos);
    expect(await drivers.obs.itemVisivel(obs, 'Cena_Elementos', 'Legendas Música')).toBe(false);
    expect(await drivers.obs.itemVisivel(obs, 'Cena_Elementos', 'Legendas Leitura')).toBe(false);
  });

  it('não roda com o OBS transmitindo, mas deixa forçar', async () => {
    const { ctx, drivers } = await preparar();
    drivers.obs.ler = async () => ({
      online: true,
      erro: null,
      cenaAtual: 'Câmera Frente',
      cenas: [],
      transmitindo: true,
      gravando: false,
      tempoTransmissaoS: 10,
      bitrateKbps: 4000,
      framesPerdidos: 0,
      percFramesPerdidos: 0,
    });
    const mostrarLetra = vi.spyOn(drivers.holyrics, 'mostrarLetra');

    const bloqueado = await checarLegendas(ctx, RAPIDO);
    expect(bloqueado.status).toBe('pulado');
    expect(bloqueado.bloqueio).toEqual({ motivo: expect.stringMatching(/transmitindo/), podeForcar: true });
    expect(mostrarLetra).not.toHaveBeenCalled();

    const forcado = await checarLegendas(ctx, { ...RAPIDO, forcar: true });
    expect(forcado.bloqueio).toBeUndefined();
    expect(mostrarLetra).toHaveBeenCalled();
  });

  /** A regra que mais importa: com algo no ar no Holyrics, nem forçando. */
  it('não roda com apresentação no ar no Holyrics, nem forçando', async () => {
    const { ctx, drivers, dispositivos } = await preparar();
    await drivers.holyrics.mostrarVersiculo(porId(dispositivos, 'pc-fundo'), 'Jo 3:16');
    const mostrarLetra = vi.spyOn(drivers.holyrics, 'mostrarLetra');

    const r = await checarLegendas(ctx, { ...RAPIDO, forcar: true });
    expect(r.bloqueio?.podeForcar).toBe(false);
    expect(r.bloqueio?.motivo).toMatch(/PC Fundo/);
    expect(mostrarLetra).not.toHaveBeenCalled();
  });

  it('respeita o horário proibido, a não ser forçando', async () => {
    const { ctx } = await preparar();
    // dispositivosDemo proíbe domingo das 19:00 às 21:30.
    const domingoNoite = { ...RAPIDO, agora: () => new Date(2026, 9, 4, 20, 0) };

    const r = await checarLegendas(ctx, domingoNoite);
    expect(r.bloqueio?.motivo).toMatch(/horário proibido para testes \(Dom 19:00–21:30\)/);

    const forcado = await checarLegendas(ctx, { ...domingoNoite, forcar: true });
    expect(forcado.bloqueio).toBeUndefined();
  });

  it('continua com o outro Holyrics quando um está desligado', async () => {
    const { ctx, drivers } = await preparar();
    const ler = drivers.holyrics.ler.bind(drivers.holyrics);
    drivers.holyrics.ler = async (d, op) =>
      d.id === 'pc-fundo' ? { online: false, erro: 'Não foi possível falar com o Holyrics.', apresentacao: null } : ler(d, op);

    const r = await checarLegendas(ctx, RAPIDO);
    expect(passo(r, 'pc-fundo:holyrics')?.status).toBe('falha');
    expect(passo(r, 'pc-fundo:holyrics')?.comoResolver).toMatch(/Ligue o PC Fundo e abra o Holyrics/);
    expect(passo(r, 'pc-fundo:musica')).toBeUndefined();
    expect(passo(r, 'note-frente:musica')?.status).toBe('ok');
    expect(passo(r, 'note-frente:leitura')?.status).toBe('ok');
  });

  it('pede para ligar o OBS quando ele não responde', async () => {
    const { ctx, drivers } = await preparar();
    drivers.obs.ler = async () => ({
      online: false,
      erro: 'Não foi possível conectar ao OBS.',
      cenaAtual: null,
      cenas: [],
      transmitindo: false,
      gravando: false,
      tempoTransmissaoS: 0,
      bitrateKbps: 0,
      framesPerdidos: 0,
      percFramesPerdidos: 0,
    });

    const r = await checarLegendas(ctx, RAPIDO);
    expect(r.status).toBe('falha');
    expect(passo(r, 'note-frente:holyrics')?.comoResolver).toMatch(/Ligue o OBS do PC Transmissão/);
    expect(passo(r, 'pc-fundo:holyrics')?.comoResolver).toMatch(/Ligue o OBS do PC Transmissão/);
  });

  it('acusa o gatilho quando o grupo não abre, sem sugerir atualizar a fonte', async () => {
    const { ctx, drivers } = await preparar();
    drivers.obs.itemVisivel = async () => false;

    const r = await checarLegendas(ctx, { ...RAPIDO, holyrics: ['note-frente'] });
    const musica = passo(r, 'note-frente:musica');
    expect(musica?.status).toBe('falha');
    expect(musica?.detalhe).toMatch(/grupo "Legendas Música" não abriu/);
    expect(musica?.comoResolver).toMatch(/gatilho "ao exibir música"/);
    expect(musica?.acao).toBeUndefined();
  });

  it('fecha o grupo quando o gatilho de encerrar não fecha', async () => {
    const { ctx, drivers } = await preparar();
    drivers.obs.itemVisivel = async () => true;
    const definir = vi.spyOn(drivers.obs, 'definirItemVisivel');

    const r = await checarLegendas(ctx, { ...RAPIDO, holyrics: ['note-frente'] });
    expect(passo(r, 'note-frente:musica')?.detalhe).toMatch(/não fechou ao encerrar/);
    expect(definir).toHaveBeenCalledWith(expect.anything(), 'Cena_Elementos', 'Legendas Música', false);
  });

  it('pede uma música na lista de reprodução quando ela está vazia', async () => {
    const { ctx, drivers } = await preparar();
    drivers.holyrics.listarPlaylist = async () => [];

    const r = await checarLegendas(ctx, { ...RAPIDO, holyrics: ['note-frente'] });
    expect(passo(r, 'note-frente:musica')?.status).toBe('falha');
    expect(passo(r, 'note-frente:musica')?.comoResolver).toMatch(/adicione qualquer música à lista de reprodução/);
    // A leitura não depende da lista e segue.
    expect(passo(r, 'note-frente:leitura')?.status).toBe('ok');
  });

  it('aponta os gatilhos que faltam', async () => {
    const { ctx, drivers } = await preparar();
    const listar = drivers.holyrics.listarGatilhos.bind(drivers.holyrics);
    drivers.holyrics.listarGatilhos = async (d, op) =>
      (await listar(d, op)).filter((g) => !(g.quando === 'closing' && g.tipo === 'any_verse'));

    const r = await checarLegendas(ctx, { ...RAPIDO, holyrics: ['note-frente'] });
    expect(passo(r, 'note-frente:gatilhos')?.status).toBe('falha');
    expect(passo(r, 'note-frente:gatilhos')?.detalhe).toMatch(/faltando: ao encerrar texto bíblico/);
  });

  it('só avisa quando não dá para ler os gatilhos, e segue testando', async () => {
    const { ctx, drivers } = await preparar();
    drivers.holyrics.listarGatilhos = async () => {
      throw new Error('O token do Holyrics não tem permissão para "GetTriggers".');
    };

    const r = await checarLegendas(ctx, { ...RAPIDO, holyrics: ['note-frente'] });
    expect(passo(r, 'note-frente:gatilhos')?.status).toBe('aviso');
    expect(passo(r, 'note-frente:musica')?.status).toBe('ok');
  });

  it('não testa o Holyrics desmarcado em "Programas de cada máquina"', async () => {
    const dispositivos = dispositivosDemo().map((d) => (d.id === 'pc-fundo' ? { ...d, apps: ['powerpoint' as const] } : d));
    const { ctx } = await preparar(dispositivos);

    const r = await checarLegendas(ctx, RAPIDO);
    expect(r.passos.some((p) => p.id.startsWith('pc-fundo'))).toBe(false);
    expect(r.status).toBe('ok');
  });

  it('não dá veredito pela imagem quando a fonte muda sozinha', async () => {
    const { ctx, drivers } = await preparar();
    let n = 0;
    drivers.obs.capturarSource = async () => `img${n++}`;
    const mostrarLetra = vi.spyOn(drivers.holyrics, 'mostrarLetra');

    const r = await checarLegendas(ctx, { ...RAPIDO, holyrics: ['note-frente'] });
    expect(passo(r, 'note-frente:musica')?.status).toBe('aviso');
    expect(mostrarLetra).not.toHaveBeenCalled();
  });

  it('encerra a apresentação mesmo se a captura final falhar', async () => {
    const { ctx, drivers, dispositivos } = await preparar();
    const capturar = drivers.obs.capturarSource.bind(drivers.obs);
    let chamadas = 0;
    drivers.obs.capturarSource = async (d, f) => {
      chamadas += 1;
      if (chamadas === 3) throw new Error('OBS caiu');
      return capturar(d, f);
    };

    const r = await checarLegendas(ctx, { ...RAPIDO, holyrics: ['note-frente'] });
    expect(passo(r, 'note-frente:musica')?.status).toBe('falha');
    expect((await drivers.holyrics.ler(porId(dispositivos, 'note-frente'))).apresentacao).toBeNull();
  });

  it('recusa um segundo teste enquanto o primeiro roda', async () => {
    const { ctx } = await preparar();
    const [primeiro, segundo] = await Promise.all([checarLegendas(ctx, RAPIDO), checarLegendas(ctx, RAPIDO)]);
    expect(primeiro.bloqueio).toBeUndefined();
    expect(segundo.bloqueio?.motivo).toMatch(/já existe um teste/);
  });

  it('explica onde configurar quando não há legendas configuradas', async () => {
    const dispositivos = dispositivosDemo().map((d) =>
      d.servicos.obs ? { ...d, servicos: { ...d.servicos, obs: { porta: 4455 } } } : d,
    );
    const { ctx } = await preparar(dispositivos);
    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('falha');
    expect(r.passos[0]?.comoResolver).toMatch(/Ajustes › Legendas/);
  });

  it('continua aceitando a configuração antiga (uma fonte só)', async () => {
    const dispositivos = dispositivosDemo().map((d) =>
      d.servicos.obs ? { ...d, servicos: { ...d.servicos, obs: { porta: 4455, sourceLegenda: 'Legenda' } } } : d,
    );
    const { ctx } = await preparar(dispositivos);
    const r = await checarLegendas(ctx, RAPIDO);

    expect(passo(r, 'configuracao')?.status).toBe('aviso');
    expect(passo(r, 'configuracao')?.comoResolver).toMatch(/Ajustes › Legendas/);
    // Formato antigo: o Holyrics com URL de legenda é o dono da fonte.
    expect(passo(r, 'note-frente:musica')?.status).toBe('ok');
    expect(passo(r, 'note-frente:leitura')).toBeUndefined();
  });
});

describe('conferirGatilhos', () => {
  it('aceita "qualquer slide de música" no lugar de "qualquer música" ao exibir', () => {
    const r = conferirGatilhos([
      { id: '1', ativo: true, quando: 'displaying', tipo: 'any_song_slide', receptor: 'obs_v5', descricao: '' },
      { id: '2', ativo: false, quando: 'closing', tipo: 'any_song', receptor: 'obs_v5', descricao: '' },
    ]);
    expect(r.faltando).toEqual(['ao exibir texto bíblico', 'ao encerrar texto bíblico']);
    expect(r.desligados).toEqual(['ao encerrar música']);
  });
});
