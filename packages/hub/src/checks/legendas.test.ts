import { describe, it, expect, vi } from 'vitest';
import type { DispositivoConfig } from '@maestro/shared';
import { checarLegendas } from './legendas.js';
import type { ContextoCheck } from './tipos.js';
import type { Drivers } from '../drivers/tipos.js';

const noteFrente: DispositivoConfig = {
  id: 'note-frente',
  nome: 'Note Frente',
  host: '192.168.0.21',
  fixarHost: false,
  servicos: {
    holyrics: { porta: 8091, token: 't', legendaUrl: 'http://192.168.0.21:8080/legenda' },
  },
};

const pcTransmissao: DispositivoConfig = {
  id: 'pc-transmissao',
  nome: 'PC Transmissão',
  host: '192.168.0.20',
  fixarHost: false,
  servicos: { obs: { porta: 4455, senha: 's', sourceLegenda: 'Legenda' } },
};

interface Cenario {
  apresentacaoNoAr?: boolean;
  statusPagina?: number;
  sourceVisivel?: boolean;
  /** Imagens devolvidas em sequência por capturarSource. */
  capturas?: string[];
}

function montarContexto(cenario: Cenario = {}): {
  ctx: ContextoCheck;
  espioes: {
    apresentacaoRapida: ReturnType<typeof vi.fn>;
    encerrarApresentacao: ReturnType<typeof vi.fn>;
  };
} {
  const capturas = [...(cenario.capturas ?? ['imgA', 'imgA', 'imgB'])];
  const apresentacaoRapida = vi.fn(async () => undefined);
  const encerrarApresentacao = vi.fn(async () => undefined);

  const drivers = {
    holyrics: {
      ler: async () => ({
        online: true,
        erro: null,
        apresentacao: cenario.apresentacaoNoAr
          ? { id: '1', tipo: 'song', nome: 'Santo', slide: 1, totalSlides: 4, tipoSlide: 'default' }
          : null,
      }),
      checarPaginaLegenda: async () => ({
        status: cenario.statusPagina ?? 200,
        url: 'http://192.168.0.21:8080/legenda',
      }),
      apresentacaoRapida,
      encerrarApresentacao,
    },
    obs: {
      sourceVisivel: async () => cenario.sourceVisivel ?? true,
      capturarSource: async () => capturas.shift() ?? 'imgFinal',
    },
  } as unknown as Drivers;

  return {
    ctx: { drivers, dispositivos: () => [noteFrente, pcTransmissao] },
    espioes: { apresentacaoRapida, encerrarApresentacao },
  };
}

/** Esperas curtas: o que se testa aqui é a lógica, não o relógio. */
const RAPIDO = { esperaRenderizacaoMs: 5, esperaReferenciaMs: 5 };

const passo = (r: Awaited<ReturnType<typeof checarLegendas>>, id: string) =>
  r.passos.find((p) => p.id === id);

describe('checarLegendas', () => {
  it('aprova a cadeia inteira quando a imagem do OBS muda com o marcador', async () => {
    const { ctx, espioes } = montarContexto({ capturas: ['imgA', 'imgA', 'imgB'] });
    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('ok');
    expect(passo(r, 'prova-real')?.status).toBe('ok');
    expect(espioes.apresentacaoRapida).toHaveBeenCalledOnce();
    expect(espioes.encerrarApresentacao).toHaveBeenCalledOnce();
  });

  it('acusa falha quando o marcador não chega na imagem do OBS', async () => {
    const { ctx } = montarContexto({ capturas: ['imgA', 'imgA', 'imgA'] });
    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('falha');
    expect(passo(r, 'prova-real')?.comoResolver).toMatch(/Atualize a fonte de navegador/);
  });

  /**
   * A regra que mais importa: o teste com marcador escreve na tela pública. Se
   * já tem coisa no ar, ele não pode rodar de jeito nenhum.
   */
  it('recusa a prova real quando já existe apresentação no ar', async () => {
    const { ctx, espioes } = montarContexto({ apresentacaoNoAr: true });
    const r = await checarLegendas(ctx, RAPIDO);

    expect(passo(r, 'prova-real')?.status).toBe('pulado');
    expect(espioes.apresentacaoRapida).not.toHaveBeenCalled();
    expect(espioes.encerrarApresentacao).not.toHaveBeenCalled();
  });

  it('não dá veredito pela imagem quando a fonte muda sozinha', async () => {
    // Duas capturas de referência já diferentes = fonte animada; comparar
    // antes/depois não provaria nada.
    const { ctx, espioes } = montarContexto({ capturas: ['imgA', 'imgB', 'imgC'] });
    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('aviso');
    expect(passo(r, 'prova-real')?.status).toBe('aviso');
    expect(espioes.apresentacaoRapida).not.toHaveBeenCalled();
  });

  it('tira o marcador do ar mesmo se a captura final falhar', async () => {
    const { ctx, espioes } = montarContexto();
    (ctx.drivers.obs as unknown as { capturarSource: unknown }).capturarSource = vi
      .fn()
      .mockResolvedValueOnce('imgA')
      .mockResolvedValueOnce('imgA')
      .mockRejectedValueOnce(new Error('OBS caiu'));

    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('falha');
    expect(espioes.encerrarApresentacao).toHaveBeenCalled();
  });

  it('para na página de legendas quando ela responde 404', async () => {
    const { ctx } = montarContexto({ statusPagina: 404 });
    const r = await checarLegendas(ctx, RAPIDO);

    expect(passo(r, 'pagina-legenda')?.status).toBe('falha');
    expect(r.status).toBe('falha');
  });

  it('aponta a fonte do OBS quando ela está com o olho fechado', async () => {
    const { ctx, espioes } = montarContexto({ sourceVisivel: false });
    const r = await checarLegendas(ctx, RAPIDO);

    expect(passo(r, 'obs-source')?.status).toBe('falha');
    // Sem fonte visível não faz sentido gastar o marcador.
    expect(espioes.apresentacaoRapida).not.toHaveBeenCalled();
  });

  it('pula a prova real quando pedido explicitamente', async () => {
    const { ctx, espioes } = montarContexto();
    const r = await checarLegendas(ctx, { ...RAPIDO, provaReal: false });

    expect(r.status).toBe('ok');
    expect(passo(r, 'prova-real')).toBeUndefined();
    expect(espioes.apresentacaoRapida).not.toHaveBeenCalled();
  });

  it('explica o que configurar quando nenhuma máquina tem legenda', async () => {
    const ctx: ContextoCheck = {
      drivers: {} as Drivers,
      dispositivos: () => [],
    };
    const r = await checarLegendas(ctx, RAPIDO);

    expect(r.status).toBe('falha');
    expect(r.passos[0]?.comoResolver).toMatch(/Dispositivos/);
  });
});
