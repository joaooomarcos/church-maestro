import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { extrairFontes, extrairFonteAtual, criarDriverNdi } from './ndi.js';
import { ErroDriver } from './tipos.js';

/**
 * O formato de /v1/sources não é documentado pela NDI e já variou entre versões
 * do NDI Tools, então o parser precisa aguentar as formas conhecidas sem
 * derrubar o painel.
 */
describe('extrairFontes', () => {
  it('aceita lista simples de strings', () => {
    expect(extrairFontes(['PC-LIVE (Screen Capture)', 'NOTE-FRENTE (Screen Capture)'])).toEqual([
      'NOTE-FRENTE (Screen Capture)',
      'PC-LIVE (Screen Capture)',
    ]);
  });

  it('aceita lista de objetos com name', () => {
    expect(extrairFontes([{ name: 'PC-FUNDO (Screen Capture)' }])).toEqual([
      'PC-FUNDO (Screen Capture)',
    ]);
  });

  it('lê apenas as chaves de fontes NDI, ignorando displays e áudio', () => {
    const resposta = {
      ndi_sources: ['PC-LIVE (Screen Capture)'],
      display_devices: ['\\\\.\\DISPLAY1', 'Monitor secundário'],
      audio_devices: ['Alto-falantes (Realtek)'],
    };
    expect(extrairFontes(resposta)).toEqual(['PC-LIVE (Screen Capture)']);
  });

  it('remove duplicatas e ordena', () => {
    expect(extrairFontes(['B (X)', 'A (X)', 'B (X)'])).toEqual(['A (X)', 'B (X)']);
  });

  it('devolve lista vazia para formatos desconhecidos em vez de quebrar', () => {
    expect(extrairFontes(null)).toEqual([]);
    expect(extrairFontes(42)).toEqual([]);
    expect(extrairFontes({ formato: 'novo', coisas: [1, 2] })).toEqual([]);
  });
});

describe('extrairFonteAtual', () => {
  it('lê NDI_source', () => {
    expect(extrairFonteAtual({ version: 1, NDI_source: 'PC-LIVE (Screen Capture)' })).toBe(
      'PC-LIVE (Screen Capture)',
    );
  });

  it('trata string vazia como nenhuma fonte selecionada', () => {
    expect(extrairFonteAtual({ NDI_source: '' })).toBeNull();
  });

  it('devolve null quando o campo não existe', () => {
    expect(extrairFonteAtual({ version: 1 })).toBeNull();
  });
});

describe('driver NDI sobre HTTP', () => {
  let servidor: Server | undefined;

  afterEach(async () => {
    if (servidor) await new Promise<void>((r) => servidor?.close(() => r()));
    servidor = undefined;
  });

  async function subir(
    responder: (url: string, corpo: string) => { status: number; corpo: unknown },
  ): Promise<number> {
    servidor = createServer((req, res) => {
      let corpo = '';
      req.on('data', (c) => (corpo += c));
      req.on('end', () => {
        const { status, corpo: resposta } = responder(req.url ?? '', corpo);
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(resposta));
      });
    });
    await new Promise<void>((r) => servidor?.listen(0, '127.0.0.1', r));
    const endereco = servidor?.address();
    if (typeof endereco === 'string' || endereco === null) throw new Error('sem porta');
    return endereco.port;
  }

  it('lê fonte atual e disponíveis numa só chamada', async () => {
    const porta = await subir((url) =>
      url.includes('/v1/sources')
        ? { status: 200, corpo: { ndi_sources: ['PC-LIVE (Screen Capture)'] } }
        : { status: 200, corpo: { version: 1, NDI_source: 'PC-LIVE (Screen Capture)' } },
    );

    const estado = await criarDriverNdi().ler('127.0.0.1', porta);
    expect(estado.online).toBe(true);
    expect(estado.fonteAtual).toBe('PC-LIVE (Screen Capture)');
    expect(estado.fontesDisponiveis).toEqual(['PC-LIVE (Screen Capture)']);
  });

  it('envia o corpo que o Studio Monitor espera ao trocar a fonte', async () => {
    let recebido = '';
    const porta = await subir((url, corpo) => {
      if (url.includes('/v1/configuration')) recebido = corpo;
      return { status: 200, corpo: {} };
    });

    await criarDriverNdi().definirFonte('127.0.0.1', porta, 'NOTE-FRENTE (Screen Capture)');
    expect(JSON.parse(recebido)).toEqual({
      version: 1,
      NDI_source: 'NOTE-FRENTE (Screen Capture)',
    });
  });

  it('manda string vazia para desligar a exibição', async () => {
    let recebido = '';
    const porta = await subir((_url, corpo) => {
      recebido = corpo;
      return { status: 200, corpo: {} };
    });

    await criarDriverNdi().definirFonte('127.0.0.1', porta, null);
    expect(JSON.parse(recebido).NDI_source).toBe('');
  });

  it('reporta offline em vez de lançar quando a máquina não responde', async () => {
    // Porta fechada: é o caso de máquina desligada, que acontece toda semana.
    const estado = await criarDriverNdi().ler('127.0.0.1', 9, { timeoutMs: 300 });
    expect(estado.online).toBe(false);
    expect(estado.erro).toBeTruthy();
  });

  it('falha com mensagem em português ao trocar fonte numa máquina fora do ar', async () => {
    await expect(
      criarDriverNdi().definirFonte('127.0.0.1', 9, 'X', { timeoutMs: 300 }),
    ).rejects.toBeInstanceOf(ErroDriver);
  });
});
