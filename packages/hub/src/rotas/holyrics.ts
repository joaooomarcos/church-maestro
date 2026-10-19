import type { FastifyInstance } from 'fastify';
import { ROTAS, acaoHolyricsSchema, pedidoRelogioSchema } from '@maestro/shared';
import type { ContextoApp } from './contexto.js';
import { responderDispositivoNaoEncontrado, responderErroDriver, responderRequisicaoInvalida } from './erros.js';

export function registrarRotasHolyrics(app: FastifyInstance, ctx: ContextoApp): void {
  app.post(ROTAS.holyricsAcao, async (req, reply) => {
    const corpo = acaoHolyricsSchema.safeParse(req.body);
    if (!corpo.success) {
      return responderRequisicaoInvalida(reply, `Requisição inválida: ${corpo.error.message}`);
    }
    const { dispositivo: dispositivoId, acao, indice, ativar, letraId } = corpo.data;
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) {
      return responderDispositivoNaoEncontrado(reply, dispositivoId);
    }

    try {
      switch (acao) {
        case 'proximo':
          await ctx.drivers.holyrics.proximo(dispositivo);
          break;
        case 'anterior':
          await ctx.drivers.holyrics.anterior(dispositivo);
          break;
        case 'irPara':
          if (indice === undefined) {
            return responderRequisicaoInvalida(reply, 'Ação "irPara" exige o campo "indice".');
          }
          await ctx.drivers.holyrics.irPara(dispositivo, indice);
          break;
        case 'encerrar':
          await ctx.drivers.holyrics.encerrarApresentacao(dispositivo);
          break;
        case 'mostrarLetra':
          if (!letraId) {
            return responderRequisicaoInvalida(reply, 'Ação "mostrarLetra" exige o campo "letraId".');
          }
          await ctx.drivers.holyrics.mostrarLetra(dispositivo, letraId);
          break;
        case 'f8':
          await ctx.drivers.holyrics.definirF(dispositivo, 8, ativar ?? true);
          break;
        case 'f9':
          await ctx.drivers.holyrics.definirF(dispositivo, 9, ativar ?? true);
          break;
        case 'f10':
          await ctx.drivers.holyrics.definirF(dispositivo, 10, ativar ?? true);
          break;
      }
      return reply.send({ ok: true });
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });

  app.get(ROTAS.holyricsPlaylist, async (req, reply) => {
    const { dispositivo: dispositivoId } = req.query as { dispositivo?: string };
    if (!dispositivoId) {
      return responderRequisicaoInvalida(reply, 'Informe o dispositivo na consulta.');
    }
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) {
      return responderDispositivoNaoEncontrado(reply, dispositivoId);
    }

    try {
      // Pode haver muitas músicas e o Holyrics demora mais para listar do que para responder ao estado.
      const itens = await ctx.drivers.holyrics.listarPlaylist(dispositivo, { timeoutMs: 4000 });
      return reply.send({ itens });
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });

  /** Onde está a página do Holyrics que mostra o telão; o celular abre direto nela. */
  app.get(ROTAS.holyricsVisualizacao, async (req, reply) => {
    const { dispositivo: dispositivoId } = req.query as { dispositivo?: string };
    if (!dispositivoId) return responderRequisicaoInvalida(reply, 'Informe o dispositivo na consulta.');
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, dispositivoId);

    const url = await ctx.drivers.holyrics.paginaVisualizacao(dispositivo).catch(() => null);
    return reply.send({ url });
  });

  /** Relógio do papel de parede: como está agora. */
  app.get(ROTAS.holyricsRelogio, async (req, reply) => {
    const { dispositivo: dispositivoId } = req.query as { dispositivo?: string };
    if (!dispositivoId) return responderRequisicaoInvalida(reply, 'Informe o dispositivo na consulta.');
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, dispositivoId);
    try {
      return reply.send(await ctx.drivers.holyrics.lerRelogio(dispositivo));
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });

  /** Muda só o que vier no corpo (mostrar, posição, tamanho) e devolve como ficou. */
  app.post(ROTAS.holyricsRelogio, async (req, reply) => {
    const corpo = pedidoRelogioSchema.safeParse(req.body);
    if (!corpo.success) return responderRequisicaoInvalida(reply, `Requisição inválida: ${corpo.error.message}`);
    const { dispositivo: dispositivoId, ...mudanca } = corpo.data;
    const dispositivo = ctx.obterDispositivo(dispositivoId);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, dispositivoId);
    try {
      return reply.send(await ctx.drivers.holyrics.definirRelogio(dispositivo, mudanca));
    } catch (erro) {
      return responderErroDriver(reply, erro);
    }
  });
}
