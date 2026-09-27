import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { cabecalhoDisposition, criarAreaCompartilhada, ErroCompartilhar, sanearNome } from './compartilhar.js';

async function pastaTemporaria(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'maestro-compartilhar-'));
}

async function lerTudo(fluxo: NodeJS.ReadableStream): Promise<string> {
  const pedacos: Buffer[] = [];
  for await (const pedaco of fluxo) pedacos.push(Buffer.from(pedaco as Buffer));
  return Buffer.concat(pedacos).toString('utf8');
}

/** O nome vem de qualquer celular da rede; nada dele pode virar caminho. */
describe('sanearNome', () => {
  it('tira pastas, inclusive tentativas de subir de nível', () => {
    expect(sanearNome('../../etc/passwd')).toBe('passwd');
    expect(sanearNome('C:\\Users\\x\\louvor.pptx')).toBe('louvor.pptx');
  });

  it('mantém acentos e espaços do nome real', () => {
    expect(sanearNome('Pregação — domingo.pdf')).toBe('Pregação — domingo.pdf');
  });

  it('não deixa arquivo oculto nem nome vazio', () => {
    expect(sanearNome('.env')).toBe('env');
    expect(sanearNome('')).toBe('arquivo');
    expect(sanearNome('\u0000\u0007')).toBe('arquivo');
  });
});

describe('cabecalhoDisposition', () => {
  it('força download e leva o nome com acento no filename*', () => {
    const cabecalho = cabecalhoDisposition('Pregação.pdf');
    expect(cabecalho.startsWith('attachment;')).toBe(true);
    expect(cabecalho).toContain('filename="Pregacao.pdf"');
    expect(cabecalho).toContain("filename*=UTF-8''Prega%C3%A7%C3%A3o.pdf");
  });

  it('não deixa aspas quebrarem o header', () => {
    expect(cabecalhoDisposition('a"b.txt')).toContain('filename="a_b.txt"');
  });
});

describe('criarAreaCompartilhada', () => {
  it('colar um arquivo substitui o anterior e apaga ele do disco', async () => {
    const pasta = await pastaTemporaria();
    const area = criarAreaCompartilhada(pasta);
    await area.limpar();

    await area.colarArquivo(Readable.from([Buffer.from('primeiro')]), 'a.txt');
    await area.colarArquivo(Readable.from([Buffer.from('segundo')]), 'b.txt');

    expect(area.atual()).toMatchObject({ tipo: 'arquivo', nome: 'b.txt', tamanho: 7 });
    expect(await lerTudo(area.abrirArquivo()!)).toBe('segundo');
    expect(await readdir(pasta)).toHaveLength(1);
  });

  it('colar texto tira o arquivo do disco', async () => {
    const pasta = await pastaTemporaria();
    const area = criarAreaCompartilhada(pasta);
    await area.limpar();

    await area.colarArquivo(Readable.from([Buffer.from('x')]), 'a.txt');
    await area.colarTexto('https://exemplo.org');

    expect(area.atual()).toMatchObject({ tipo: 'texto', texto: 'https://exemplo.org' });
    expect(area.abrirArquivo()).toBeUndefined();
    expect(await readdir(pasta)).toHaveLength(0);
  });

  it('recusa pelo tamanho declarado sem gravar nada', async () => {
    const pasta = await pastaTemporaria();
    const area = criarAreaCompartilhada(pasta, 10);
    await area.limpar();

    await expect(area.colarArquivo(Readable.from([Buffer.from('x')]), 'a.txt', 11)).rejects.toMatchObject({
      status: 413,
    });
    expect(await readdir(pasta)).toHaveLength(0);
  });

  it('corta no meio quem declara pouco e manda muito, sem deixar o parcial', async () => {
    const pasta = await pastaTemporaria();
    const area = criarAreaCompartilhada(pasta, 10);
    await area.limpar();

    const envio = area.colarArquivo(
      Readable.from([Buffer.from('123456'), Buffer.from('7890ABC')]),
      'a.txt',
      5,
    );
    await expect(envio).rejects.toBeInstanceOf(ErroCompartilhar);
    expect(area.atual()).toBeNull();
    expect(await readdir(pasta)).toHaveLength(0);
  });

  it('limpar (o que roda na subida do hub) esvazia item e pasta', async () => {
    const pasta = await pastaTemporaria();
    await writeFile(path.join(pasta, 'sobra.bin'), 'de ontem');
    const area = criarAreaCompartilhada(pasta);

    await area.limpar();

    expect(area.atual()).toBeNull();
    expect(await readdir(pasta)).toHaveLength(0);
    await expect(readFile(path.join(pasta, 'sobra.bin'))).rejects.toThrow();
  });
});
