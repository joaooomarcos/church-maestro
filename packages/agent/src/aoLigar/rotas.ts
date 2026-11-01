import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { rotinaAoLigarSchema, type ErroApi } from '@maestro/shared';
import { ExecucaoEmAndamento, type ServicoAoLigar } from './index.js';

type PreHandler = (req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => void;

/**
 * A mesma rotina é servida em dois lugares: na tela de controle (só localhost)
 * e para o hub (com o token dos agentes). Quem decide quem entra é o `preHandler`.
 */
export function registrarRotasAoLigar(
  app: FastifyInstance,
  servico: ServicoAoLigar,
  caminhos: { rotina: string; testar: string },
  preHandler: PreHandler,
): void {
  app.get(caminhos.rotina, { preHandler }, async () => servico.estado());

  app.put(caminhos.rotina, { preHandler }, async (req, reply) => {
    const analisado = rotinaAoLigarSchema.safeParse(req.body);
    if (!analisado.success) {
      const corpo: ErroApi = {
        erro: 'comando-invalido',
        mensagem: 'Rotina incompleta: confira os passos (aviso sem texto, espera sem tempo…).',
      };
      reply.code(400).send(corpo);
      return;
    }
    try {
      return await servico.salvar(analisado.data);
    } catch {
      const corpo: ErroApi = { erro: 'falha-gravar', mensagem: 'Não consegui gravar a rotina nesta máquina.' };
      reply.code(500).send(corpo);
      return;
    }
  });

  app.post(caminhos.testar, { preHandler }, async (_req, reply) => {
    try {
      servico.iniciarTeste();
      return reply.code(202).send({ iniciado: true });
    } catch (err) {
      if (err instanceof ExecucaoEmAndamento) {
        const corpo: ErroApi = { erro: 'em-andamento', mensagem: err.message };
        reply.code(409).send(corpo);
        return;
      }
      throw err;
    }
  });
}
