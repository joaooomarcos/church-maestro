import type { Cenario, Verificacao } from '@maestro/shared';
import { ErroDriver } from '../drivers/tipos.js';
import type { ContextoApp } from '../rotas/contexto.js';
import { executarERegistrar } from './historico.js';

type Veredito = { verdadeira: boolean; descricao: string } | { erro: string };

async function avaliarCondicao(ctx: ContextoApp, verificacao: Verificacao): Promise<Veredito> {
  if (verificacao.condicao === 'obsSemTransmitir') {
    const estado = ctx.store.obterSnapshot().dispositivos.find((d) => d.id === verificacao.dispositivo);
    // OBS offline, fechado ou máquina sem estado também é "sem transmitir": é o pior caso.
    const transmitindo = Boolean(estado?.obs?.online && estado.obs.transmitindo);
    return { verdadeira: !transmitindo, descricao: 'o OBS não está transmitindo' };
  }

  const { youtubeCanalId: canalId, youtubeChaveApi: chaveApi } = ctx.config;
  if (!canalId || !chaveApi) {
    return { erro: 'o ID do canal e a chave de API não estão configurados em Ajustes › YouTube.' };
  }
  try {
    const aoVivo = await ctx.drivers.youtube.aoVivo({ canalId, chaveApi });
    return { verdadeira: !aoVivo, descricao: 'o YouTube não está ao vivo' };
  } catch (erro) {
    return { erro: erro instanceof ErroDriver ? erro.message : 'erro inesperado na consulta.' };
  }
}

/**
 * Avalia a condição e, se for verdadeira, roda o cenário. Condição que não deu
 * para checar (sem chave, sem internet) NÃO roda o cenário: melhor um alerta
 * claro do que um cenário disparado por engano. Quem chama já marcou o dia.
 */
export async function avaliarVerificacao(ctx: ContextoApp, verificacao: Verificacao): Promise<void> {
  const cenario: Cenario | undefined = ctx.cenarios().find((c) => c.id === verificacao.cenarioId);
  if (!cenario) return;
  const avisar = (nivel: 'info' | 'alerta', texto: string) =>
    ctx.store.transmitirMensagem({ tipo: 'aviso', nivel, texto });

  const veredito = await avaliarCondicao(ctx, verificacao);
  if ('erro' in veredito) {
    const alvo = verificacao.condicao === 'youtubeSemLive' ? 'o YouTube' : 'o OBS';
    avisar('alerta', `Não consegui verificar ${alvo}: ${veredito.erro} "${cenario.nome}" não rodou.`);
    return;
  }
  if (!veredito.verdadeira) {
    avisar('info', `Verificação: tudo certo, "${cenario.nome}" não precisou rodar.`);
    return;
  }

  const { resultado, registro } = await executarERegistrar(ctx, cenario, 'verificacao', verificacao.id);
  avisar(
    resultado.ok ? 'info' : 'alerta',
    resultado.ok
      ? `Verificação: ${veredito.descricao}, então "${cenario.nome}" foi aplicado.`
      : `Verificação: ${veredito.descricao}, e "${cenario.nome}" teve falhas — ${registro.resumo}`,
  );
}
