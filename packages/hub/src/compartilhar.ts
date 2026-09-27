import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { LIMITE_ARQUIVO_BYTES, type ItemCompartilhado } from '@maestro/shared';
import { raizRepo } from './config.js';

/** Erro com o status HTTP que a rota deve devolver. */
export class ErroCompartilhar extends Error {
  constructor(
    override readonly message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ErroCompartilhar';
  }
}

const TAMANHO_MAXIMO_NOME = 150;

/**
 * Nome de arquivo que veio de um celular qualquer da rede. Ele só vai para o
 * header de download — no disco o arquivo tem nome próprio —, mas mesmo assim
 * sai daqui sem pasta, sem caractere de controle e sem ponto no começo.
 */
export function sanearNome(bruto: string): string {
  const base = bruto.split(/[\\/]/).pop() ?? '';
  const limpo = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, TAMANHO_MAXIMO_NOME);
  return limpo || 'arquivo';
}

/**
 * Content-Disposition que obriga o navegador a baixar. `filename` em ASCII para
 * navegadores antigos e `filename*` (RFC 5987) com o nome de verdade, acentos
 * inclusive.
 */
export function cabecalhoDisposition(nome: string): string {
  const ascii = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const codificado = encodeURIComponent(nome).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${codificado}`;
}

export interface AreaCompartilhada {
  atual(): ItemCompartilhado;
  /** Stream do arquivo atual, ou undefined se o item atual não for arquivo. */
  abrirArquivo(): ReadStream | undefined;
  limpar(): Promise<void>;
  colarTexto(texto: string): Promise<ItemCompartilhado>;
  colarArquivo(fluxo: Readable, nome: string, tamanhoDeclarado?: number): Promise<ItemCompartilhado>;
}

/**
 * Um item só, em memória, e no máximo um arquivo em disco. Colar de novo
 * substitui; reiniciar o hub apaga (a pasta é esvaziada na subida).
 */
export function criarAreaCompartilhada(
  pasta: string = path.join(raizRepo, 'data', 'compartilhar'),
  limiteBytes: number = LIMITE_ARQUIVO_BYTES,
): AreaCompartilhada {
  let item: ItemCompartilhado = null;
  let caminhoArquivo: string | null = null;

  /** Troca o item atual e apaga o arquivo que ficou para trás. */
  async function substituir(novo: ItemCompartilhado, novoCaminho: string | null): Promise<void> {
    // Sem await entre ler e trocar: se dois envios terminam juntos, quem chegar
    // aqui por último vence, e o arquivo sempre corresponde ao item.
    const anterior = caminhoArquivo;
    item = novo;
    caminhoArquivo = novoCaminho;
    if (anterior && anterior !== novoCaminho) await rm(anterior, { force: true });
  }

  return {
    atual: () => item,

    abrirArquivo() {
      if (item?.tipo !== 'arquivo' || !caminhoArquivo) return undefined;
      return createReadStream(caminhoArquivo);
    },

    async limpar() {
      item = null;
      caminhoArquivo = null;
      await rm(pasta, { recursive: true, force: true });
      await mkdir(pasta, { recursive: true });
    },

    async colarTexto(texto) {
      const novo: ItemCompartilhado = { tipo: 'texto', texto, criadoEm: Date.now() };
      await substituir(novo, null);
      return novo;
    },

    async colarArquivo(fluxo, nome, tamanhoDeclarado) {
      if (tamanhoDeclarado !== undefined && tamanhoDeclarado > limiteBytes) {
        fluxo.resume();
        throw new ErroCompartilhar('Arquivo grande demais. O limite é 100 MB.', 413);
      }

      await mkdir(pasta, { recursive: true });
      const marca = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const parcial = path.join(pasta, `envio-${marca}.parcial`);
      const final = path.join(pasta, `arquivo-${marca}.bin`);

      // O Content-Length pode mentir (ou faltar): conta de verdade no caminho.
      let bytes = 0;
      const contador = new Transform({
        transform(pedaco: Buffer, _codificacao, pronto) {
          bytes += pedaco.length;
          if (bytes > limiteBytes) {
            pronto(new ErroCompartilhar('Arquivo grande demais. O limite é 100 MB.', 413));
            return;
          }
          pronto(null, pedaco);
        },
      });

      try {
        await pipeline(fluxo, contador, createWriteStream(parcial));
      } catch (erro) {
        await rm(parcial, { force: true });
        if (erro instanceof ErroCompartilhar) throw erro;
        throw new ErroCompartilhar('O envio foi interrompido. Tente de novo.', 400);
      }

      await rename(parcial, final);
      const novo: ItemCompartilhado = {
        tipo: 'arquivo',
        nome: sanearNome(nome),
        tamanho: bytes,
        criadoEm: Date.now(),
      };
      await substituir(novo, final);
      return novo;
    },
  };
}
