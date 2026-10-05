import type { FastifyInstance } from 'fastify';
import {
  ALVO_HUB,
  ROTAS,
  pedidoAtualizacaoSchema,
  respostaVersoesSchema,
  type EstadoAgente,
  type MaquinaVersao,
} from '@maestro/shared';
import {
  SHA_VALIDO,
  dispararAtualizacaoLocal,
  ipsLocais,
  lerVersaoInstalada,
  numeroDaVersao,
  obterVersoesDisponiveis,
} from '../versoes.js';
import type { ContextoApp } from './contexto.js';
import { responderErroDriver, responderRequisicaoInvalida } from './erros.js';

/** Sem a máquina voltar na versão pedida depois disso, o painel assume que algo deu errado. */
const LIMITE_ATUALIZACAO_MS = 10 * 60_000;

function mesmoSha(a: string | null | undefined, b: string): boolean {
  return Boolean(a) && (b.startsWith(a as string) || (a as string).startsWith(b));
}

/** Versões instaladas em cada máquina e o que está disponível para instalar. */
export function registrarRotasVersoes(app: FastifyInstance, ctx: ContextoApp): void {
  // Na troca de arquivos o agente fica fora do ar e o painel perdia tudo o que
  // sabia da máquina. Lembrar o que foi pedido e o que foi visto por último
  // deixa o cartão contar a história até ela voltar.
  const pedidos = new Map<string, { sha: string; em: number }>();
  const ultimas = new Map<string, { sha: string | null; notas: string }>();

  // Demonstração: nenhuma máquina é atualizada, mas o cartão percorre as etapas
  // como percorreria de verdade, para dar para ver (e ensaiar) a tela.
  const ensaios = new Map<string, { sha: string; em: number }>();
  const instaladasNoEnsaio = new Map<string, { sha: string; em: number }>();
  const ETAPAS_ENSAIO: Array<{ ate: number; estado: 'baixando' | 'compilando' | 'trocando'; mensagem: string }> = [
    { ate: 3000, estado: 'baixando', mensagem: 'Baixando a versão' },
    { ate: 9000, estado: 'compilando', mensagem: 'Compilando a versão nova (a máquina segue no ar)' },
    { ate: 13_000, estado: 'trocando', mensagem: 'Trocando os arquivos e reiniciando' },
  ];

  function agenteEmDemonstracao(id: string, agente: EstadoAgente | undefined): EstadoAgente | undefined {
    if (!agente) return agente;
    const ensaio = ensaios.get(id);
    if (ensaio) {
      const decorrido = Date.now() - ensaio.em;
      const etapa = ETAPAS_ENSAIO.find((e) => decorrido < e.ate);
      if (etapa) {
        return {
          ...agente,
          // Na troca de arquivos a máquina some do painel, como na igreja.
          online: etapa.estado !== 'trocando',
          atualizacao: { estado: etapa.estado, sha: ensaio.sha, mensagem: etapa.mensagem, ts: Date.now() },
        };
      }
      ensaios.delete(id);
      instaladasNoEnsaio.set(id, { sha: ensaio.sha, em: Date.now() });
    }
    const instalada = instaladasNoEnsaio.get(id);
    if (!instalada) return agente;
    return {
      ...agente,
      versaoSha: instalada.sha,
      versaoNotas: 'instalada no ensaio (demonstração)',
      atualizacao: { estado: 'ok', sha: instalada.sha, mensagem: 'Atualizado', ts: instalada.em },
    };
  }

  app.get(ROTAS.versoes, async (_req, reply) => {
    const [disponivel, instaladaAqui] = await Promise.all([
      obterVersoesDisponiveis(),
      lerVersaoInstalada(),
    ]);

    const locais = new Set(ipsLocais());
    const snapshot = ctx.store.obterSnapshot();

    const maquinas: MaquinaVersao[] = ctx.dispositivos().map((dispositivo) => {
      const estado = snapshot.dispositivos.find((d) => d.id === dispositivo.id);
      const agente = ctx.modoDemo ? agenteEmDemonstracao(dispositivo.id, estado?.agente) : estado?.agente;
      const ehMaquinaDoHub = locais.has(dispositivo.host);
      // O agente é a fonte da verdade; no hub, o versao.txt local cobre o caso
      // de o agente daquela máquina estar fora do ar.
      const shaAgora = agente?.versaoSha ?? (ehMaquinaDoHub ? instaladaAqui?.sha : undefined) ?? null;
      const notasAgora = agente?.versaoNotas ?? (ehMaquinaDoHub ? instaladaAqui?.notas : undefined) ?? '';
      if (shaAgora) ultimas.set(dispositivo.id, { sha: shaAgora, notas: notasAgora });

      const lembrada = shaAgora ? undefined : ultimas.get(dispositivo.id);
      const sha = shaAgora ?? lembrada?.sha ?? null;
      const notas = shaAgora ? notasAgora : (lembrada?.notas ?? '');
      const online = Boolean(agente?.online) || ehMaquinaDoHub;

      let atualizacao = agente?.atualizacao;
      const pedido = pedidos.get(dispositivo.id);
      if (pedido) {
        const chegou = online && mesmoSha(shaAgora, pedido.sha);
        const falhouDepoisDoPedido =
          online && atualizacao?.estado === 'falhou' && atualizacao.ts >= pedido.em - 5000;
        if (chegou || falhouDepoisDoPedido) {
          pedidos.delete(dispositivo.id);
        } else {
          const minutos = Math.round((Date.now() - pedido.em) / 60_000);
          const andamento = atualizacao && atualizacao.ts >= pedido.em - 5000 ? atualizacao : undefined;
          if (Date.now() - pedido.em > LIMITE_ATUALIZACAO_MS) {
            atualizacao = {
              estado: 'falhou',
              sha: pedido.sha,
              mensagem: `Faz ${minutos} min que a atualização foi pedida e a máquina não voltou na versão nova. Veja data\\atualizacao.log nela.`,
              ts: Date.now(),
            };
          } else if (!online) {
            atualizacao = {
              estado: 'trocando',
              sha: pedido.sha,
              mensagem: andamento
                ? `${andamento.mensagem}. A máquina saiu do ar para reiniciar; costuma voltar em 1 a 2 minutos.`
                : 'Pedido enviado. Aguardando a máquina responder; ela sai do ar por 1 a 2 minutos ao trocar os arquivos.',
              ts: Date.now(),
            };
          } else if (andamento) {
            atualizacao = andamento;
          } else {
            atualizacao = {
              estado: 'baixando',
              sha: pedido.sha,
              mensagem: 'Pedido recebido; a máquina está começando.',
              ts: Date.now(),
            };
          }
        }
      }

      return {
        id: dispositivo.id,
        nome: dispositivo.nome,
        online,
        sha,
        versao: numeroDaVersao(sha, disponivel.disponiveis),
        notas,
        ehMaquinaDoHub,
        ultimaConhecida: !shaAgora && Boolean(lembrada),
        ...(pedidos.get(dispositivo.id)
          ? { alvoSha: pedidos.get(dispositivo.id)?.sha, pedidoEm: pedidos.get(dispositivo.id)?.em }
          : {}),
        ...(atualizacao ? { atualizacao } : {}),
      };
    });

    // A máquina do hub aparece mesmo que ainda não tenha agente pareado.
    if (!maquinas.some((m) => m.ehMaquinaDoHub)) {
      maquinas.unshift({
        id: ALVO_HUB,
        nome: 'Esta máquina (painel)',
        online: true,
        sha: instaladaAqui?.sha ?? null,
        versao: numeroDaVersao(instaladaAqui?.sha ?? null, disponivel.disponiveis),
        notas: instaladaAqui?.notas ?? '',
        ehMaquinaDoHub: true,
        ultimaConhecida: false,
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
    // Em demonstração o hub roda dentro da pasta do projeto: atualizar "esta
    // máquina" espelharia uma versão baixada por cima dela, apagando o .git.
    if (ctx.modoDemo) {
      if (alvo === ALVO_HUB || !ctx.obterDispositivo(alvo)) {
        return responderRequisicaoInvalida(
          reply,
          'Modo de demonstração: nenhuma máquina é atualizada de verdade.',
        );
      }
      ensaios.set(alvo, { sha, em: Date.now() });
      pedidos.set(alvo, { sha, em: Date.now() });
      return reply.send({ aceito: true, alvo });
    }

    if (alvo === ALVO_HUB) {
      dispararAtualizacaoLocal(sha);
      app.log.info({ sha, alvo }, 'atualizando a máquina do hub');
      return reply.send({ aceito: true, alvo });
    }

    const dispositivo = ctx.obterDispositivo(alvo);
    if (!dispositivo) {
      return responderRequisicaoInvalida(reply, `Máquina "${alvo}" não está cadastrada.`);
    }

    // Na máquina do hub o atualizador é disparado aqui mesmo: assim a
    // atualização funciona mesmo que o agente dela esteja fora do ar.
    if (ipsLocais().includes(dispositivo.host)) {
      pedidos.set(dispositivo.id, { sha, em: Date.now() });
      dispararAtualizacaoLocal(sha);
      app.log.info({ sha, alvo }, 'atualizando a máquina do hub');
      return reply.send({ aceito: true, alvo });
    }

    try {
      await ctx.drivers.agente.atualizar(dispositivo, sha);
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
    pedidos.set(dispositivo.id, { sha, em: Date.now() });
    app.log.info({ sha, alvo }, 'atualizacao pedida ao agente');
    return reply.send({ aceito: true, alvo });
  });
}
