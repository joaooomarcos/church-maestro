import type { FastifyInstance } from 'fastify';
import { ROTAS, definirAppsSchema, pedidoAcordarSchema, type ResultadoAcordar } from '@maestro/shared';
import { enviarWakeOnLan } from '../rede/acordar.js';
import type { ContextoApp } from './contexto.js';
import { responderDispositivoNaoEncontrado, responderRequisicaoInvalida } from './erros.js';

/** Escolhas por máquina: quais programas ela usa, e acordá-la. */
export function registrarRotasMaquinas(app: FastifyInstance, ctx: ContextoApp): void {
  app.put<{ Params: { id: string } }>(ROTAS.appsDaMaquina, async (req, reply) => {
    const corpo = definirAppsSchema.safeParse(req.body);
    if (!corpo.success) return responderRequisicaoInvalida(reply, 'Lista de programas inválida.');
    const dispositivo = ctx.obterDispositivo(req.params.id);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, req.params.id);

    const apps = [...new Set(corpo.data.apps)];
    const atualizado = await ctx.atualizarDispositivo({ ...dispositivo, apps });
    return reply.send({ apps: atualizado.apps ?? [] });
  });

  app.post(ROTAS.acordar, async (req, reply) => {
    const corpo = pedidoAcordarSchema.safeParse(req.body);
    if (!corpo.success) return responderRequisicaoInvalida(reply, 'Escolha a máquina.');
    const dispositivo = ctx.obterDispositivo(corpo.data.dispositivo);
    if (!dispositivo) return responderDispositivoNaoEncontrado(reply, corpo.data.dispositivo);

    const estado = ctx.store.obterSnapshot().dispositivos.find((d) => d.id === dispositivo.id);
    const mac = estado?.agente?.mac ?? dispositivo.mac;

    // As duas coisas juntas: a tela acorda se a máquina está ligada em repouso, e o
    // sinal pela rede acorda a que está dormindo ou desligada de modo que aceite isso.
    let telaAcordada = false;
    if (dispositivo.servicos.agente && estado?.agente?.online) {
      try {
        await ctx.drivers.agente.acordar(dispositivo);
        telaAcordada = true;
      } catch {
        // o sinal pela rede ainda pode funcionar
      }
    }
    const sinalEnviado = mac && dispositivo.host ? await enviarWakeOnLan(mac, dispositivo.host) : false;

    let mensagem: string;
    if (telaAcordada && sinalEnviado) mensagem = `${dispositivo.nome}: pedi para a tela acordar e mandei o sinal de ligar pela rede.`;
    else if (telaAcordada) mensagem = `${dispositivo.nome}: pedi para a tela acordar.`;
    else if (sinalEnviado) mensagem = `${dispositivo.nome}: mandei o sinal de ligar pela rede. Se ela estava dormindo, deve acordar em instantes.`;
    else if (!mac) mensagem = `${dispositivo.nome} não respondeu e o Maestro ainda não sabe o endereço de rede dela (MAC). Ele aprende quando ela estiver ligada e com o agente no ar.`;
    else mensagem = `Não consegui acordar ${dispositivo.nome}.`;

    const resultado: ResultadoAcordar = { telaAcordada, sinalEnviado, mensagem };
    return reply.send(resultado);
  });
}
