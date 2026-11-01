import { describe, it, expect, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { criarDriverYoutube } from './youtube.js';
import { ErroDriver } from './tipos.js';

const CHAVE = 'AIzaChaveSecretaDeTeste123';
let servidor: Server | undefined;

async function subir(status: number, corpo: unknown, aoReceber?: (req: IncomingMessage) => void): Promise<string> {
  servidor = createServer((req, res) => {
    aoReceber?.(req);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
  });
  await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', ok));
  return `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
}

afterEach(async () => {
  await new Promise<void>((ok) => (servidor ? servidor.close(() => ok()) : ok()));
  servidor = undefined;
});

const config = { canalId: 'UCabcdefghijklmnopqrstuv', chaveApi: CHAVE };

describe('DriverYoutube', () => {
  it('responde ao vivo quando a busca traz um vídeo', async () => {
    const base = await subir(200, { items: [{ id: { videoId: 'x' } }] });
    expect(await criarDriverYoutube(base).aoVivo(config)).toBe(true);
  });

  it('responde sem live quando a busca vem vazia', async () => {
    const base = await subir(200, { items: [] });
    expect(await criarDriverYoutube(base).aoVivo(config)).toBe(false);
  });

  it('manda a chave só no cabeçalho, nunca na URL', async () => {
    let recebida: IncomingMessage | undefined;
    const base = await subir(200, { items: [] }, (req) => (recebida = req));
    await criarDriverYoutube(base).aoVivo(config);
    expect(recebida?.headers['x-goog-api-key']).toBe(CHAVE);
    expect(recebida?.url).not.toContain(CHAVE);
    expect(recebida?.url).toContain('channelId=UCabcdefghijklmnopqrstuv');
    expect(recebida?.url).toContain('eventType=live');
  });

  it('chave recusada (403) vira erro em português sem a chave', async () => {
    const base = await subir(403, { error: { message: `key ${CHAVE} inválida` } });
    const erro = await criarDriverYoutube(base).aoVivo(config).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDriver);
    const e = erro as ErroDriver;
    expect(e.message).toContain('chave de API');
    expect(`${e.message} ${e.causaTecnica}`).not.toContain(CHAVE);
  });

  it('resposta inválida vira erro', async () => {
    const base = await subir(200, 'isto não é json');
    await expect(criarDriverYoutube(base).aoVivo(config)).rejects.toBeInstanceOf(ErroDriver);
  });

  it('sem internet vira erro em português sem a chave', async () => {
    const erro = await criarDriverYoutube('http://127.0.0.1:1').aoVivo(config).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDriver);
    expect(JSON.stringify([(erro as ErroDriver).message, (erro as ErroDriver).causaTecnica])).not.toContain(CHAVE);
  });
});
