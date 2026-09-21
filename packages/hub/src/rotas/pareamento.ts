import type { FastifyInstance } from 'fastify';
import {
  ROTAS,
  dispositivoConfigSchema,
  pedidoPareamentoSchema,
  slugificar,
  type ErroApi,
} from '@maestro/shared';
import { pinConfere } from '../auth.js';
import type { ContextoApp } from './contexto.js';
import { responderRequisicaoInvalida } from './erros.js';

const LIMITE_SUFIXOS = 50;

/**
 * Escolhe o id do dispositivo a partir do nome que a pessoa digitou. Se o id já
 * existe em outra máquina (duas "Note Frente", por exemplo), sufixa em vez de
 * sobrescrever o cadastro alheio.
 */
export function escolherId(
  ctx: Pick<ContextoApp, 'obterDispositivo'>,
  nome: string,
  host: string,
  idAnterior: string | undefined,
): string {
  const base = slugificar(nome) || 'dispositivo';
  for (let n = 1; n <= LIMITE_SUFIXOS; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    const existente = ctx.obterDispositivo(id);
    if (!existente) return id;
    // Mesma máquina pareando de novo (renomeando ou trocando de serviços).
    if (id === idAnterior || existente.host === host) return id;
  }
  return `${base}-${Date.now()}`;
}

/** Pareamento do agente: cadastra a máquina no hub e devolve o token dos agentes. */
export function registrarRotasPareamento(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(
    ROTAS.pareamento,
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const corpo = pedidoPareamentoSchema.safeParse(req.body);
      if (!corpo.success) {
        return responderRequisicaoInvalida(reply, `Pareamento inválido: ${corpo.error.message}`);
      }
      const pedido = corpo.data;

      if (!pinConfere(pedido.pin, ctx.config.pin)) {
        const erro: ErroApi = {
          erro: 'pin_incorreto',
          mensagem: 'PIN incorreto. É o mesmo PIN que a equipe usa para abrir o painel.',
        };
        return reply.code(401).send(erro);
      }

      const id = escolherId(ctx, pedido.nome, pedido.host, pedido.dispositivoIdAnterior);
      const dispositivo = dispositivoConfigSchema.parse({
        id,
        nome: pedido.nome,
        host: pedido.host,
        fixarHost: false,
        servicos: { agente: { porta: pedido.porta }, ...pedido.servicos },
      });

      const salvo = await ctx.registrarDispositivo(dispositivo, pedido.dispositivoIdAnterior);
      app.log.info({ dispositivo: salvo.id, host: salvo.host }, 'dispositivo pareado');

      return reply.send({ dispositivoId: salvo.id, nome: salvo.nome, token: ctx.config.tokenAgentes });
    },
  );
}
