import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import {
  CAMINHO_COMPARTILHAR,
  LIMITE_ARQUIVO_BYTES,
  ROTAS,
  colarTextoSchema,
  type ErroApi,
} from '@maestro/shared';
import {
  ErroCompartilhar,
  cabecalhoDisposition,
  type AreaCompartilhada,
} from '../compartilhar.js';
import { urlNaRede } from '../versoes.js';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

/** A área é aberta para a rede inteira: o limite segura quem insistir. */
const LIMITE_ENVIOS = { config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } };

function responderErro(reply: import('fastify').FastifyReply, erro: ErroCompartilhar) {
  const corpo: ErroApi = { erro: 'compartilhar', mensagem: erro.message };
  return reply.code(erro.status).send(corpo);
}

/**
 * Área de transferência da igreja. Aberta a quem está na rede, sem PIN — por
 * isso o arquivo nunca é servido para abrir no navegador (veja o GET abaixo).
 */
export function registrarRotasCompartilhar(
  app: FastifyInstance,
  ctx: ContextoApp,
  area: AreaCompartilhada,
): void {
  // Upload cru: o navegador manda o arquivo como corpo, e ele vai em stream
  // direto para o disco, sem passar inteiro pela memória.
  app.addContentTypeParser('application/octet-stream', (_req, corpo, pronto) => {
    pronto(null, corpo);
  });

  app.get(ROTAS.compartilhar, async (_req, reply) => {
    void reply.header('Cache-Control', 'no-store');
    return reply.send({ item: area.atual() });
  });

  app.delete(ROTAS.compartilhar, LIMITE_ENVIOS, async (_req, reply) => {
    await area.limpar();
    return reply.send({ item: null });
  });

  app.post(ROTAS.compartilharTexto, LIMITE_ENVIOS, async (req, reply) => {
    const corpo = colarTextoSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, 'Texto vazio ou grande demais (limite de 100 mil caracteres).');
    }
    const item = await area.colarTexto(corpo.data.texto);
    return reply.send({ item });
  });

  app.post(
    ROTAS.compartilharArquivo,
    // Folga sobre o limite para o próprio contador responder 413 com mensagem.
    { ...LIMITE_ENVIOS, bodyLimit: LIMITE_ARQUIVO_BYTES + 1024 * 1024 },
    async (req, reply) => {
      if (!(req.body instanceof Readable)) {
        return responderRequisicaoInvalida(reply, 'Envie o arquivo como application/octet-stream.');
      }

      let nome = 'arquivo';
      const cabecalho = req.headers['x-nome-arquivo'];
      if (typeof cabecalho === 'string') {
        try {
          nome = decodeURIComponent(cabecalho);
        } catch {
          nome = cabecalho;
        }
      }
      const declarado = Number(req.headers['content-length']);

      try {
        const item = await area.colarArquivo(
          req.body,
          nome,
          Number.isFinite(declarado) ? declarado : undefined,
        );
        return reply.send({ item });
      } catch (erro) {
        if (erro instanceof ErroCompartilhar) return responderErro(reply, erro);
        throw erro;
      }
    },
  );

  app.get(ROTAS.compartilharArquivo, async (_req, reply) => {
    const item = area.atual();
    const fluxo = area.abrirArquivo();
    if (item?.tipo !== 'arquivo' || !fluxo) {
      const erro: ErroApi = { erro: 'sem_arquivo', mensagem: 'Não há arquivo compartilhado agora.' };
      return reply.code(404).send(erro);
    }
    // Sempre download, nunca exibição: um .html ou .svg enviado por qualquer um
    // abriria na mesma origem do painel e poderia usar a sessão da equipe.
    return reply
      .header('Content-Type', 'application/octet-stream')
      .header('Content-Disposition', cabecalhoDisposition(item.nome))
      .header('X-Content-Type-Options', 'nosniff')
      .header('Content-Length', String(item.tamanho))
      .header('Cache-Control', 'no-store')
      .send(fluxo);
  });

  // Só a equipe (sessão do painel) pede o link, para mostrar o QR code.
  app.get(ROTAS.compartilharLink, async (_req, reply) => {
    return reply.send({ url: urlNaRede(ctx.config.porta, CAMINHO_COMPARTILHAR) });
  });
}
