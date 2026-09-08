import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { DispositivoConfig } from '@maestro/shared';
import { criarDriverHolyrics, normalizarApresentacao } from './holyrics.js';
import { ErroDriver } from './tipos.js';

describe('normalizarApresentacao', () => {
  it('mapeia a resposta de GetCurrentPresentation', () => {
    const bruta = {
      id: 'abc123',
      type: 'song',
      name: 'Grande é o Senhor',
      slide_number: 3,
      total_slides: 12,
      slide_type: 'default',
    };
    expect(normalizarApresentacao(bruta)).toEqual({
      id: 'abc123',
      tipo: 'song',
      nome: 'Grande é o Senhor',
      slide: 3,
      totalSlides: 12,
      tipoSlide: 'default',
    });
  });

  it('trata null como nada em exibição', () => {
    expect(normalizarApresentacao(null)).toBeNull();
    expect(normalizarApresentacao(undefined)).toBeNull();
  });

  it('dá um rótulo legível quando o item vem sem nome', () => {
    // Versículos e apresentações rápidas chegam com name vazio.
    expect(normalizarApresentacao({ type: 'verse', name: '' })?.nome).toBe('Texto bíblico');
    expect(normalizarApresentacao({ type: 'quick_presentation' })?.nome).toBe(
      'Apresentação rápida',
    );
  });

  it('aceita ausência de slide_number sem inventar zero', () => {
    const r = normalizarApresentacao({ type: 'image', name: 'Aviso' });
    expect(r?.slide).toBeNull();
    expect(r?.totalSlides).toBeNull();
  });
});

describe('driver Holyrics sobre HTTP', () => {
  let servidor: Server | undefined;
  let chamadas: { acao: string; token: string | null; corpo: string }[] = [];

  afterEach(async () => {
    if (servidor) await new Promise<void>((r) => servidor?.close(() => r()));
    servidor = undefined;
    chamadas = [];
  });

  async function subir(responder: (acao: string) => unknown): Promise<DispositivoConfig> {
    servidor = createServer((req, res) => {
      let corpo = '';
      req.on('data', (c) => (corpo += c));
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://local');
        const acao = url.pathname.replace('/api/', '');
        chamadas.push({ acao, token: url.searchParams.get('token'), corpo });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(responder(acao)));
      });
    });
    await new Promise<void>((r) => servidor?.listen(0, '127.0.0.1', r));
    const endereco = servidor?.address();
    if (typeof endereco === 'string' || endereco === null) throw new Error('sem porta');

    return {
      id: 'note-frente',
      nome: 'Note Frente',
      host: '127.0.0.1',
      fixarHost: false,
      servicos: { holyrics: { porta: endereco.port, token: 'segredo123' } },
    };
  }

  it('manda o token na query e corpo JSON vazio', async () => {
    const dispositivo = await subir(() => ({ status: 'ok', data: null }));
    await criarDriverHolyrics().proximo(dispositivo);

    expect(chamadas[0]?.acao).toBe('ActionNext');
    expect(chamadas[0]?.token).toBe('segredo123');
    expect(chamadas[0]?.corpo).toBe('{}');
  });

  it('manda o índice em ActionGoToIndex', async () => {
    const dispositivo = await subir(() => ({ status: 'ok' }));
    await criarDriverHolyrics().irPara(dispositivo, 4);
    expect(JSON.parse(chamadas[0]?.corpo ?? '{}')).toEqual({ index: 4 });
  });

  it('lê a apresentação atual', async () => {
    const dispositivo = await subir(() => ({
      status: 'ok',
      data: { id: 'x', type: 'song', name: 'Santo Santo', slide_number: 2, total_slides: 8 },
    }));

    const estado = await criarDriverHolyrics().ler(dispositivo);
    expect(estado.online).toBe(true);
    expect(estado.apresentacao?.nome).toBe('Santo Santo');
    expect(estado.apresentacao?.slide).toBe(2);
  });

  it('entende status ok com data null como "nada no ar"', async () => {
    const dispositivo = await subir(() => ({ status: 'ok', data: null }));
    const estado = await criarDriverHolyrics().ler(dispositivo);
    expect(estado.online).toBe(true);
    expect(estado.apresentacao).toBeNull();
  });

  /**
   * O Holyrics devolve HTTP 200 mesmo quando recusa a ação — checar só o código
   * HTTP daria um falso "deu certo".
   */
  it('trata erro de token vindo com HTTP 200', async () => {
    const dispositivo = await subir(() => ({ status: 'error', error: 'invalid token' }));

    await expect(criarDriverHolyrics().proximo(dispositivo)).rejects.toThrow(/token/i);
    const estado = await criarDriverHolyrics().ler(dispositivo);
    expect(estado.online).toBe(false);
  });

  it('explica falta de permissão apontando para "gerenciar permissões"', async () => {
    const dispositivo = await subir(() => ({ status: 'error', error: 'no permission' }));
    await expect(criarDriverHolyrics().proximo(dispositivo)).rejects.toThrow(/permiss/i);
  });

  it('recusa dispositivo sem Holyrics configurado', async () => {
    const semHolyrics: DispositivoConfig = {
      id: 'note-som',
      nome: 'Note Som',
      host: '127.0.0.1',
      fixarHost: false,
      servicos: {},
    };
    await expect(criarDriverHolyrics().proximo(semHolyrics)).rejects.toBeInstanceOf(ErroDriver);
  });

  it('avisa quando a URL de legenda não foi configurada', async () => {
    const dispositivo = await subir(() => ({ status: 'ok' }));
    await expect(criarDriverHolyrics().checarPaginaLegenda(dispositivo)).rejects.toThrow(
      /URL de legenda/i,
    );
  });
});
