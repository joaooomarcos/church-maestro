import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  ROTAS,
  acaoConvidadoSchema,
  acaoPermitida,
  caminhoConvidado,
  criarLinkFixoSchema,
  entrarConvidadoSchema,
  estadoConvidadoSchema,
  idLinkFixoSchema,
  trocarPinLinkFixoSchema,
  linkFixoConvidadoSchema,
  pedidoLinkConvidadoSchema,
  type DispositivoConfig,
  type ErroApi,
  type LinkFixoConvidado,
  type ModoConvidado,
  type RespostaLinkFixo,
} from '@maestro/shared';
import { pinConfere } from '../auth.js';
import { gerarPin } from '../pinsConvidado.js';
import { urlNaRede } from '../versoes.js';
import type { ContextoApp } from './contexto.js';
import {
  responderDispositivoNaoEncontrado,
  responderErroDriver,
  responderRequisicaoInvalida,
} from './erros.js';

const COOKIE_CONVIDADO = 'maestro_convidado';
/** Link temporário: quem apresentou de manhã não precisa digitar o PIN de novo à tarde. */
const UM_DIA_S = 60 * 60 * 24;
/** Link fixo: vale até o PIN mudar, que derruba a sessão por outro caminho (a versão do PIN). */
const UM_ANO_S = 60 * 60 * 24 * 365;

/** O que o cookie do celular dá direito a fazer, já resolvido contra o que está salvo agora. */
export interface AcessoConvidado {
  /** Segredo da URL do link a que este cookie dá acesso. */
  token: string;
  dispositivo: DispositivoConfig;
  /** O que o link controla; ausente só nos links temporários antigos. */
  modo: ModoConvidado | undefined;
  /** Controle completo (lista de reprodução, tela preta, prévias...). */
  completo: boolean;
  /** Nome do link fixo, quando é um. */
  nomeLink?: string;
}

/**
 * Valor do cookie. Temporário: `t:<token>` (ou só o token, de antes dos links
 * fixos). Fixo: `f:<token>:<versão do PIN>` — trocar o PIN muda a versão e o
 * cookie antigo deixa de valer.
 */
function valorCookieTemporario(token: string): string {
  return `t:${token}`;
}

function valorCookieFixo(link: LinkFixoConvidado): string {
  return `f:${link.token}:${link.versaoPin}`;
}

/** Resolve um valor de cookie (já assinado e validado) em acesso. Puro: testável sem HTTP. */
export function resolverAcessoConvidado(ctx: ContextoApp, valor: string): AcessoConvidado | undefined {
  if (valor.startsWith('f:')) {
    const [, token, versao] = valor.split(':');
    const link = ctx.linksConvidado().find((l) => l.token === token);
    if (!link || link.versaoPin !== versao) return undefined;
    const dispositivo = ctx.obterDispositivo(link.dispositivo);
    if (!dispositivo) return undefined;
    // Setas do teclado nunca têm controle completo, mesmo que o arquivo diga o contrário.
    return {
      token: link.token,
      dispositivo,
      modo: link.modo,
      completo: link.completo && link.modo !== 'teclado',
      nomeLink: link.nome,
    };
  }
  const token = valor.startsWith('t:') ? valor.slice(2) : valor;
  const dispositivo = ctx.dispositivos().find((d) => d.tokenConvidado === token);
  if (!dispositivo) return undefined;
  const modo = dispositivo.modoConvidado;
  return { token, dispositivo, modo, completo: dispositivo.completoConvidado === true && modo !== 'teclado' };
}

function acessoDoConvidado(ctx: ContextoApp, req: FastifyRequest): AcessoConvidado | undefined {
  const bruto = req.cookies[COOKIE_CONVIDADO];
  if (!bruto) return undefined;
  const resultado = req.unsignCookie(bruto);
  if (!resultado.valid || !resultado.value) return undefined;
  return resolverAcessoConvidado(ctx, resultado.value);
}

function exigirConvidado(
  ctx: ContextoApp,
  req: FastifyRequest,
  reply: FastifyReply,
): AcessoConvidado | undefined {
  const acesso = acessoDoConvidado(ctx, req);
  // A página manda o token da URL em que foi aberta: o cookie de outro link não vale aqui.
  const { token: tokenDaPagina } = (req.query ?? {}) as { token?: string };
  if (!acesso || (tokenDaPagina && tokenDaPagina !== acesso.token)) {
    const erro: ErroApi = {
      erro: 'convidado_nao_autenticado',
      mensagem: 'Escaneie o QR code de novo e informe o PIN.',
    };
    void reply.code(401).send(erro);
    return undefined;
  }
  return acesso;
}

function negar(reply: FastifyReply, erro: string, mensagem: string): FastifyReply {
  const corpo: ErroApi = { erro, mensagem };
  return reply.code(403).send(corpo);
}

function modosDisponiveis(
  ctx: ContextoApp,
  dispositivo: DispositivoConfig,
  escolhido: ModoConvidado | undefined,
): ModoConvidado[] {
  const estado = ctx.store.obterSnapshot().dispositivos.find((d) => d.id === dispositivo.id);
  const agenteOnline = estado?.agente?.online === true;
  const modos: ModoConvidado[] = [];
  if (dispositivo.servicos.holyrics) modos.push('holyrics');
  if (agenteOnline && estado?.agente?.capacidades.includes('powerpoint')) modos.push('powerpoint');
  if (agenteOnline) modos.push('teclado');
  // A equipe escolheu o que este link controla: o convidado não vê o resto.
  return escolhido ? modos.filter((modo) => modo === escolhido) : modos;
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

function paraResposta(ctx: ContextoApp, link: LinkFixoConvidado): RespostaLinkFixo {
  const { token, versaoPin: _versao, ...resto } = link;
  return {
    ...resto,
    url: urlNaRede(ctx.config.porta, caminhoConvidado(token)),
    dispositivoNome: ctx.obterDispositivo(link.dispositivo)?.nome ?? link.dispositivo,
  };
}

/**
 * Página do convidado: quem vai apresentar escaneia o QR, digita o PIN uma vez
 * e passa os slides do próprio celular. Há dois tipos de link:
 * - temporário (um por máquina): PIN de convidado do hub, vale um dia;
 * - fixo: tem PIN próprio, não expira e cai quando a equipe troca o PIN.
 * O que cada link pode fazer é conferido aqui, no servidor, a cada pedido.
 */
export function registrarRotasConvidado(app: FastifyInstance, ctx: ContextoApp): void {
  // --- equipe (exige sessão do painel) --------------------------------------

  app.post(ROTAS.convidadoLink, async (req, reply) => {
    const corpo = pedidoLinkConvidadoSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Pedido inválido: ${corpo.error.message}`);
    }

    const dispositivo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);

    let token = dispositivo.tokenConvidado;
    if (!token || corpo.data.regerar) token = randomBytes(16).toString('hex');

    // Sem `modo` no pedido, a escolha anterior continua valendo.
    const modo = corpo.data.modo ?? dispositivo.modoConvidado;
    const completo =
      modo !== 'teclado' && (corpo.data.modo ? (corpo.data.completo ?? false) : dispositivo.completoConvidado === true);
    const { modoConvidado: modoAntes, completoConvidado: completoAntes, ...resto } = dispositivo;
    if (token !== dispositivo.tokenConvidado || modo !== modoAntes || completo !== (completoAntes === true)) {
      await ctx.atualizarDispositivo({
        ...resto,
        tokenConvidado: token,
        ...(modo ? { modoConvidado: modo } : {}),
        ...(completo ? { completoConvidado: true } : {}),
      });
    }
    // O PIN pode ter nascido agora (valor padrão do schema): grava para ele não
    // mudar no próximo reinício do hub, no meio de um culto.
    await ctx.atualizarConfigHub({ pinConvidado: ctx.config.pinConvidado });

    return reply.send({
      dispositivoId: dispositivo.id,
      nome: dispositivo.nome,
      url: urlNaRede(ctx.config.porta, caminhoConvidado(token)),
      pin: ctx.config.pinConvidado,
      completo,
      ...(modo ? { modo } : {}),
    });
  });

  app.get(ROTAS.convidadoFixos, async (_req, reply) => {
    return reply.send({ links: ctx.linksConvidado().map((link) => paraResposta(ctx, link)) });
  });

  app.post(ROTAS.convidadoFixos, async (req, reply) => {
    const corpo = criarLinkFixoSchema.safeParse(req.body);
    if (!corpo.success) {
      const pinInvalido = corpo.error.issues.some((problema) => problema.path[0] === 'pin');
      return responderRequisicaoInvalida(
        reply,
        pinInvalido ? 'O PIN deve ter exatamente 4 dígitos.' : `Pedido inválido: ${corpo.error.message}`,
      );
    }
    const dispositivo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);

    const link = linkFixoConvidadoSchema.parse({
      id: randomBytes(6).toString('hex'),
      nome: corpo.data.nome,
      token: randomBytes(16).toString('hex'),
      dispositivo: dispositivo.id,
      modo: corpo.data.modo,
      completo: corpo.data.modo !== 'teclado' && corpo.data.completo,
      pin: corpo.data.pin ?? gerarPin(),
      versaoPin: randomBytes(8).toString('hex'),
    });
    await ctx.salvarLinkConvidado(link);
    return reply.send(paraResposta(ctx, link));
  });

  /**
   * Novo PIN (o escolhido pela equipe ou, sem ele, um sorteado): a versão muda e
   * todos os celulares daquele link caem. Os outros links não são tocados.
   */
  app.post(ROTAS.convidadoFixosPin, async (req, reply) => {
    const corpo = trocarPinLinkFixoSchema.safeParse(req.body);
    if (!corpo.success) {
      const pinInvalido = corpo.error.issues.some((problema) => problema.path[0] === 'pin');
      return responderRequisicaoInvalida(
        reply,
        pinInvalido ? 'O PIN deve ter exatamente 4 dígitos.' : 'Informe o link.',
      );
    }
    const link = ctx.linksConvidado().find((l) => l.id === corpo.data.id);
    if (!link) {
      const erro: ErroApi = { erro: 'link_nao_encontrado', mensagem: 'Este link fixo não existe mais.' };
      return reply.code(404).send(erro);
    }
    const novo: LinkFixoConvidado = {
      ...link,
      pin: corpo.data.pin ?? gerarPin(),
      versaoPin: randomBytes(8).toString('hex'),
    };
    await ctx.salvarLinkConvidado(novo);
    return reply.send(paraResposta(ctx, novo));
  });

  app.post(ROTAS.convidadoFixosExcluir, async (req, reply) => {
    const corpo = idLinkFixoSchema.safeParse(req.body);
    if (!corpo.success) return responderRequisicaoInvalida(reply, 'Informe o link.');
    await ctx.removerLinkConvidado(corpo.data.id);
    return reply.send({ ok: true });
  });

  // --- convidado (PIN do link + cookie assinado) -----------------------------

  app.post(
    ROTAS.convidadoEntrar,
    // O mesmo limite vale para links temporários e fixos.
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '5 minutes',
          // Mensagem legível para o celular do convidado (o padrão do plugin é em inglês).
          errorResponseBuilder: () => ({
            statusCode: 429,
            erro: 'muitas_tentativas',
            mensagem: 'Muitas tentativas com PIN errado. Aguarde 5 minutos e tente de novo.',
          }),
        },
      },
    },
    async (req, reply) => {
      const corpo = entrarConvidadoSchema.safeParse(req.body);
      if (!corpo.success) {
        return responderRequisicaoInvalida(reply, 'Informe o PIN.');
      }

      const linkInvalido = (): FastifyReply => {
        const erro: ErroApi = {
          erro: 'link_invalido',
          mensagem: 'Este link não vale mais. Peça um QR code novo para a equipe.',
        };
        return reply.code(404).send(erro);
      };
      const pinIncorreto = (): FastifyReply => {
        const erro: ErroApi = { erro: 'pin_incorreto', mensagem: 'PIN incorreto.' };
        return reply.code(401).send(erro);
      };

      const fixo = ctx.linksConvidado().find((l) => l.token === corpo.data.token);
      if (fixo) {
        const dispositivo = ctx.obterDispositivo(fixo.dispositivo);
        if (!dispositivo) return linkInvalido();
        if (!pinConfere(corpo.data.pin, fixo.pin)) return pinIncorreto();
        void reply.cookie(COOKIE_CONVIDADO, valorCookieFixo(fixo), {
          signed: true,
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: UM_ANO_S,
        });
        return reply.send({ nome: fixo.nome });
      }

      const dispositivo = ctx.dispositivos().find((d) => d.tokenConvidado === corpo.data.token);
      if (!dispositivo) return linkInvalido();
      if (!pinConfere(corpo.data.pin, ctx.config.pinConvidado)) return pinIncorreto();

      void reply.cookie(COOKIE_CONVIDADO, valorCookieTemporario(corpo.data.token), {
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
    const acesso = exigirConvidado(ctx, req, reply);
    if (!acesso) return reply;
    const { dispositivo, completo } = acesso;

    const estado = ctx.store.obterSnapshot().dispositivos.find((d) => d.id === dispositivo.id);
    // Os dados extras só saem para link completo; nos outros nem existem na resposta.
    const extras = completo
      ? {
          holyrics: {
            online: estado?.holyrics?.online === true,
            noAr: estado?.holyrics?.apresentacao
              ? {
                  ...(estado.holyrics.apresentacao.id ? { id: estado.holyrics.apresentacao.id } : {}),
                  nome: estado.holyrics.apresentacao.nome,
                  slide: estado.holyrics.apresentacao.slide,
                  totalSlides: estado.holyrics.apresentacao.totalSlides,
                }
              : null,
          },
          powerpoint: {
            online: estado?.powerpoint?.online === true,
            emApresentacao: estado?.powerpoint?.emApresentacao === true,
            arquivo: estado?.powerpoint?.arquivo ?? null,
            slide: estado?.powerpoint?.slide ?? null,
            totalSlides: estado?.powerpoint?.totalSlides ?? null,
          },
        }
      : {};

    return reply.send(
      estadoConvidadoSchema.parse({
        dispositivoNome: dispositivo.nome,
        ...(acesso.nomeLink ? { nomeLink: acesso.nomeLink } : {}),
        modos: modosDisponiveis(ctx, dispositivo, acesso.modo),
        resumo: resumoDoQueEstaNoAr(ctx, dispositivo),
        completo,
        ...extras,
      }),
    );
  });

  app.get(ROTAS.convidadoPlaylist, async (req, reply) => {
    const acesso = exigirConvidado(ctx, req, reply);
    if (!acesso) return reply;
    if (!acesso.completo || acesso.modo !== 'holyrics') {
      return negar(reply, 'acao_nao_permitida', 'Este link não mostra a lista de reprodução.');
    }
    try {
      const itens = await ctx.drivers.holyrics.listarPlaylist(acesso.dispositivo, { timeoutMs: 4000 });
      return reply.send({ itens });
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });

  app.get(ROTAS.convidadoSlide, async (req, reply) => {
    const acesso = exigirConvidado(ctx, req, reply);
    if (!acesso) return reply;
    if (!acesso.completo || acesso.modo !== 'powerpoint') {
      return negar(reply, 'acao_nao_permitida', 'Este link não mostra a prévia dos slides.');
    }
    const { qual } = req.query as { qual?: string };
    try {
      const { imagem, tipo, slide } = await ctx.drivers.agente.miniaturaPowerPoint(
        acesso.dispositivo,
        qual === 'proximo' ? 'proximo' : 'atual',
      );
      void reply.header('content-type', tipo).header('cache-control', 'no-store');
      if (slide !== null) void reply.header('x-maestro-slide', String(slide));
      return reply.send(imagem);
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });

  app.post(ROTAS.convidadoAcao, async (req, reply) => {
    const acesso = exigirConvidado(ctx, req, reply);
    if (!acesso) return reply;
    const { dispositivo } = acesso;

    const corpo = acaoConvidadoSchema.safeParse(req.body);
    if (!corpo.success) return responderRequisicaoInvalida(reply, 'Comando inválido.');
    const { modo, acao, letraId, ativar } = corpo.data;
    if (acesso.modo && modo !== acesso.modo) {
      return negar(reply, 'modo_nao_permitido', 'Este link não controla isso. Peça um QR code novo para a equipe.');
    }
    // A palavra final é do servidor: o celular só desenha o que quiser, o que vale é isto.
    if (!acaoPermitida(modo, acao, acesso.completo)) {
      return negar(reply, 'acao_nao_permitida', 'Este link só pode voltar e avançar os slides.');
    }

    try {
      if (modo === 'holyrics') {
        const holyrics = ctx.drivers.holyrics;
        switch (acao) {
          case 'proximo':
            await holyrics.proximo(dispositivo);
            break;
          case 'anterior':
            await holyrics.anterior(dispositivo);
            break;
          case 'mostrarLetra':
            if (!letraId) return responderRequisicaoInvalida(reply, 'Escolha uma música.');
            await holyrics.mostrarLetra(dispositivo, letraId);
            break;
          case 'f8':
            await holyrics.definirF(dispositivo, 8, ativar ?? true);
            break;
          case 'f9':
            await holyrics.definirF(dispositivo, 9, ativar ?? true);
            break;
          case 'f10':
            await holyrics.definirF(dispositivo, 10, ativar ?? true);
            break;
          case 'encerrar':
            await holyrics.encerrarApresentacao(dispositivo);
            break;
          default:
            return responderRequisicaoInvalida(reply, 'Comando inválido.');
        }
      } else if (modo === 'powerpoint') {
        if (acao === 'proximo' || acao === 'anterior' || acao === 'iniciar' || acao === 'encerrar') {
          await ctx.drivers.agente.comandarPowerPoint(dispositivo, { acao });
        } else {
          return responderRequisicaoInvalida(reply, 'Comando inválido.');
        }
      } else if (acao === 'proximo' || acao === 'anterior') {
        // Setas: vão para a janela que estiver na frente, sem escolher programa.
        await ctx.drivers.agente.teclaApp(dispositivo, undefined, acao);
      } else {
        return responderRequisicaoInvalida(reply, 'Comando inválido.');
      }
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }

    return reply.send({ ok: true });
  });
}
