import type { FastifyInstance } from 'fastify';
import {
  ALVO_HUB,
  ROTAS,
  pedidoAtualizacaoSchema,
  respostaVersoesSchema,
  type MaquinaVersao,
} from '@maestro/shared';
import {
  SHA_VALIDO,
  dispararAtualizacaoLocal,
  ipsLocais,
  lerVersaoInstalada,
  obterVersoesDisponiveis,
} from '../versoes.js';
import type { ContextoApp } from './contexto.js';
import { responderErroDriver, responderRequisicaoInvalida } from './erros.js';

/** Versões instaladas em cada máquina e o que está disponível para instalar. */
export function registrarRotasVersoes(app: FastifyInstance, ctx: ContextoApp): void {
  app.get(ROTAS.versoes, async (_req, reply) => {
    const [disponivel, instaladaAqui] = await Promise.all([
      obterVersoesDisponiveis(),
      lerVersaoInstalada(),
    ]);

    const locais = new Set(ipsLocais());
    const snapshot = ctx.store.obterSnapshot();

    const maquinas: MaquinaVersao[] = ctx.dispositivos().map((dispositivo) => {
      const estado = snapshot.dispositivos.find((d) => d.id === dispositivo.id);
      const agente = estado?.agente;
      const ehMaquinaDoHub = locais.has(dispositivo.host);
      // O agente é a fonte da verdade; no hub, o versao.txt local cobre o caso
      // de o agente daquela máquina estar fora do ar.
      const sha = agente?.versaoSha ?? (ehMaquinaDoHub ? instaladaAqui?.sha : undefined) ?? null;
      const notas = agente?.versaoNotas ?? (ehMaquinaDoHub ? instaladaAqui?.notas : undefined) ?? '';

      return {
        id: dispositivo.id,
        nome: dispositivo.nome,
        online: Boolean(agente?.online) || ehMaquinaDoHub,
        sha,
        notas,
        ehMaquinaDoHub,
        ...(agente?.atualizacao ? { atualizacao: agente.atualizacao } : {}),
      };
    });

    // A máquina do hub aparece mesmo que ainda não tenha agente pareado.
    if (!maquinas.some((m) => m.ehMaquinaDoHub)) {
      maquinas.unshift({
        id: ALVO_HUB,
        nome: 'Esta máquina (painel)',
        online: true,
        sha: instaladaAqui?.sha ?? null,
        notas: instaladaAqui?.notas ?? '',
        ehMaquinaDoHub: true,
      });
    }

    return reply.send(
      respostaVersoesSchema.parse({
        aprovada: disponivel.aprovada,
        disponiveis: disponivel.disponiveis,
        maquinas,
        ...(disponivel.aviso ? { avisoRede: disponivel.aviso } : {}),
      }),
    );
  });

  app.post(ROTAS.atualizar, async (req, reply) => {
    const corpo = pedidoAtualizacaoSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Pedido inválido: ${corpo.error.message}`);
    }
    const { alvo, sha } = corpo.data;
    if (!SHA_VALIDO.test(sha)) {
      return responderRequisicaoInvalida(reply, 'Versão inválida.');
    }

    if (alvo === ALVO_HUB) {
      dispararAtualizacaoLocal(sha);
      app.log.info({ sha }, 'atualizando a máquina do hub');
      return reply.send({ aceito: true, alvo });
    }

    const dispositivo = ctx.obterDispositivo(alvo);
    if (!dispositivo) {
      return responderRequisicaoInvalida(reply, `Máquina "${alvo}" não está cadastrada.`);
    }

    // Na máquina do hub o atualizador é disparado aqui mesmo: assim a
    // atualização funciona mesmo que o agente dela esteja fora do ar.
    if (ipsLocais().includes(dispositivo.host)) {
      dispararAtualizacaoLocal(sha);
      app.log.info({ sha, alvo }, 'atualizando a máquina do hub');
      return reply.send({ aceito: true, alvo });
    }

    try {
      await ctx.drivers.agente.atualizar(dispositivo, sha);
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
    app.log.info({ sha, alvo }, 'atualizacao pedida ao agente');
    return reply.send({ aceito: true, alvo });
  });
}
