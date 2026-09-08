import type { FastifyReply } from 'fastify';
import type { ErroApi } from '@maestro/shared';
import { ErroDriver } from '../drivers/tipos.js';

/** Toda falha de integração (driver) vira 502 com mensagem em português pronta para a tela. */
export function responderErroDriver(reply: FastifyReply, erro: unknown): FastifyReply {
  if (erro instanceof ErroDriver) {
    const corpo: ErroApi = { erro: 'falha_integracao', mensagem: erro.message, detalhe: erro.causaTecnica };
    return reply.code(502).send(corpo);
  }
  const mensagem =
    erro instanceof Error ? erro.message : 'Erro desconhecido ao falar com o dispositivo.';
  const corpo: ErroApi = {
    erro: 'falha_integracao',
    mensagem,
    detalhe: erro instanceof Error ? erro.stack : undefined,
  };
  return reply.code(502).send(corpo);
}

export function responderDispositivoNaoEncontrado(reply: FastifyReply, id: string): FastifyReply {
  const corpo: ErroApi = {
    erro: 'dispositivo_nao_encontrado',
    mensagem: `Dispositivo "${id}" não está cadastrado.`,
  };
  return reply.code(404).send(corpo);
}

export function responderRequisicaoInvalida(reply: FastifyReply, mensagem: string): FastifyReply {
  const corpo: ErroApi = { erro: 'requisicao_invalida', mensagem };
  return reply.code(400).send(corpo);
}
