import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ROTAS,
  acaoConvidadoSchema,
  caminhoConvidado,
  entrarConvidadoSchema,
  estadoConvidadoSchema,
  pedidoLinkConvidadoSchema,
  type Aplicativo,
  type DispositivoConfig,
  type ErroApi,
  type ModoConvidado,
} from '@maestro/shared';
import { pinConfere } from '../auth.js';
import { ipsLocais } from '../versoes.js';
import type { ContextoApp } from './contexto.js';
import {
  responderDispositivoNaoEncontrado,
  responderErroDriver,
  responderRequisicaoInvalida,
} from './erros.js';

const COOKIE_CONVIDADO = 'maestro_convidado';
/** Um dia: quem apresentou de manhã não precisa digitar o PIN de novo à tarde. */
const UM_DIA_S = 60 * 60 * 24;

function urlDoConvidado(ctx: ContextoApp, token: string): string {
  const ip = ipsLocais().find((endereco) => endereco !== '127.0.0.1' && endereco !== 'localhost');
  return `http://${ip ?? '127.0.0.1'}:${ctx.config.porta}${caminhoConvidado(token)}`;
}

/** Máquina a que o celular do convidado está preso, pelo cookie assinado. */
function dispositivoDoConvidado(
  ctx: ContextoApp,
  req: FastifyRequest,
): DispositivoConfig | undefined {
  const bruto = req.cookies[COOKIE_CONVIDADO];
  if (!bruto) return undefined;
  const resultado = req.unsignCookie(bruto);
  if (!resultado.valid || !resultado.value) return undefined;
  return ctx.dispositivos().find((d) => d.tokenConvidado === resultado.value);
}

function exigirConvidado(
  ctx: ContextoApp,
  req: FastifyRequest,
  reply: FastifyReply,
): DispositivoConfig | undefined {
  const dispositivo = dispositivoDoConvidado(ctx, req);
  if (!dispositivo) {
    const erro: ErroApi = {
      erro: 'convidado_nao_autenticado',
      mensagem: 'Escaneie o QR code de novo e informe o PIN.',
    };
    void reply.code(401).send(erro);
    return undefined;
  }
  return dispositivo;
}

function modosDisponiveis(ctx: ContextoApp, dispositivo: DispositivoConfig): ModoConvidado[] {
  const estado = ctx.store.obterSnapshot().dispositivos.find((d) => d.id === dispositivo.id);
  const agenteOnline = estado?.agente?.online === true;
  const modos: ModoConvidado[] = [];
  if (dispositivo.servicos.holyrics) modos.push('holyrics');
  if (agenteOnline && estado?.agente?.capacidades.includes('powerpoint')) modos.push('powerpoint');
  if (agenteOnline) modos.push('teclado');
  return modos;
}

function resumoDoQueEstaNoAr(ctx: ContextoApp, dispositivo: DispositivoConfig): string {
  const estado = ctx.store.obterSnapshot().dispositivos.find((d) => d.id === dispositivo.id);
  const apresentacao = estado?.holyrics?.apresentacao;
  if (apresentacao) {
    return `Holyrics: ${apresentacao.nome} (slide ${apresentacao.slide ?? '?'})`;
  }
  const ppt = estado?.powerpoint;
  if (ppt?.emApresentacao) return `PowerPoint: slide ${ppt.slide ?? '?'} de ${ppt.totalSlides ?? '?'}`;
  const janela = estado?.agente?.emPrimeiroPlano;
  if (janela) return `Na frente: ${janela.titulo || janela.processo}`;
  return '';
}

/**
 * Página do convidado: quem vai apresentar escaneia o QR da máquina, digita o
 * PIN de convidado uma vez e passa os slides do próprio celular. O PIN é
 * separado do da equipe e o cookie prende o celular àquela máquina.
 */
export function registrarRotasConvidado(app: FastifyInstance, ctx: ContextoApp): void {
  // Só a equipe (sessão de operador) gera o link.
  app.post(ROTAS.convidadoLink, async (req, reply) => {
    const corpo = pedidoLinkConvidadoSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Pedido inválido: ${corpo.error.message}`);
    }

    const dispositivo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);

    let token = dispositivo.tokenConvidado;
    if (!token || corpo.data.regerar) {
      token = randomBytes(16).toString('hex');
      await ctx.atualizarDispositivo({ ...dispositivo, tokenConvidado: token });
    }
    // O PIN pode ter nascido agora (valor padrão do schema): grava para ele não
    // mudar no próximo reinício do hub, no meio de um culto.
    await ctx.atualizarConfigHub({ pinConvidado: ctx.config.pinConvidado });

    return reply.send({
      dispositivoId: dispositivo.id,
      nome: dispositivo.nome,
      url: urlDoConvidado(ctx, token),
      pin: ctx.config.pinConvidado,
    });
  });

  app.post(
    ROTAS.convidadoEntrar,
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const corpo = entrarConvidadoSchema.safeParse(req.body);
      if (!corpo.success) {
        return responderRequisicaoInvalida(reply, 'Informe o PIN.');
      }

      const dispositivo = ctx.dispositivos().find((d) => d.tokenConvidado === corpo.data.token);
      if (!dispositivo) {
        const erro: ErroApi = {
          erro: 'link_invalido',
          mensagem: 'Este link não vale mais. Peça um QR code novo para a equipe.',
        };
        return reply.code(404).send(erro);
      }

      if (!pinConfere(corpo.data.pin, ctx.config.pinConvidado)) {
        const erro: ErroApi = { erro: 'pin_incorreto', mensagem: 'PIN incorreto.' };
        return reply.code(401).send(erro);
      }

      void reply.cookie(COOKIE_CONVIDADO, corpo.data.token, {
        signed: true,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: UM_DIA_S,
      });
      return reply.send({ nome: dispositivo.nome });
    },
  );

  app.get(ROTAS.convidadoEstado, async (req, reply) => {
    const dispositivo = exigirConvidado(ctx, req, reply);
    if (!dispositivo) return reply;

    const estado = ctx.store.obterSnapshot().dispositivos.find((d) => d.id === dispositivo.id);
    const abertos = Object.entries(estado?.agente?.processos ?? {})
      .filter(([, aberto]) => aberto)
      .map(([app]) => app as Aplicativo);

    return reply.send(
      estadoConvidadoSchema.parse({
        dispositivoNome: dispositivo.nome,
        modos: modosDisponiveis(ctx, dispositivo),
        resumo: resumoDoQueEstaNoAr(ctx, dispositivo),
        appsAbertos: abertos,
      }),
    );
  });

  app.post(ROTAS.convidadoAcao, async (req, reply) => {
    const dispositivo = exigirConvidado(ctx, req, reply);
    if (!dispositivo) return reply;

    const corpo = acaoConvidadoSchema.safeParse(req.body);
    if (!corpo.success) return responderRequisicaoInvalida(reply, 'Comando inválido.');
    const { modo, acao, app: alvo } = corpo.data;

    try {
      if (modo === 'holyrics') {
        if (acao === 'proximo') await ctx.drivers.holyrics.proximo(dispositivo);
        else await ctx.drivers.holyrics.anterior(dispositivo);
      } else if (modo === 'powerpoint') {
        await ctx.drivers.agente.comandarPowerPoint(dispositivo, { acao });
      } else {
        await ctx.drivers.agente.teclaApp(dispositivo, alvo ?? 'powerpoint', acao);
      }
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }

    return reply.send({ ok: true });
  });
}
