import type { AcaoCenario, Cenario, ResultadoCenario } from '@maestro/shared';
import type { ContextoApp } from '../rotas/contexto.js';

/** Texto de cada passo, para o resultado e o histórico dos agendamentos. */
export function descreverAcao(acao: AcaoCenario, ctx?: Pick<ContextoApp, 'obterDispositivo'>): string {
  const nome = (id: string): string => ctx?.obterDispositivo(id)?.nome ?? id;
  switch (acao.tipo) {
    case 'ndi.definirFonte':
      return `NDI ${nome(acao.dispositivo)} (janela ${acao.porta}) → ${acao.fonte ?? 'Nenhuma'}`;
    case 'obs.definirCena':
      return `OBS ${nome(acao.dispositivo)} → cena "${acao.cena}"`;
    case 'holyrics.f8':
      return `Holyrics ${nome(acao.dispositivo)} → plano de fundo ${acao.ativar ? 'ligado' : 'desligado'}`;
    case 'holyrics.encerrarApresentacao':
      return `Holyrics ${nome(acao.dispositivo)} → fechar apresentação`;
    case 'espera':
      return `Esperar ${acao.ms} ms`;
  }
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executarAcao(ctx: ContextoApp, acao: AcaoCenario): Promise<void> {
  if (acao.tipo === 'espera') {
    await esperar(acao.ms);
    return;
  }
  const dispositivo = ctx.obterDispositivo(acao.dispositivo);
  if (!dispositivo) throw new Error(`a máquina "${acao.dispositivo}" não está cadastrada`);

  switch (acao.tipo) {
    case 'ndi.definirFonte':
      await ctx.drivers.ndi.definirFonte(dispositivo.host, acao.porta, acao.fonte);
      return;
    case 'obs.definirCena':
      await ctx.drivers.obs.definirCena(dispositivo, acao.cena);
      return;
    case 'holyrics.f8':
      await ctx.drivers.holyrics.definirF(dispositivo, 8, acao.ativar);
      return;
    case 'holyrics.encerrarApresentacao':
      await ctx.drivers.holyrics.encerrarApresentacao(dispositivo);
      return;
  }
}

/**
 * Roda os passos em ordem. Um passo que falha não interrompe os outros: no
 * meio do culto, é melhor o datashow trocar de fonte mesmo que o Holyrics não
 * tenha respondido.
 */
export async function executarCenario(ctx: ContextoApp, cenario: Cenario): Promise<ResultadoCenario> {
  const acoes: ResultadoCenario['acoes'] = [];
  for (const [indice, acao] of cenario.acoes.entries()) {
    const descricao = descreverAcao(acao, ctx);
    try {
      await executarAcao(ctx, acao);
      acoes.push({ indice, descricao, ok: true });
    } catch (erro) {
      acoes.push({
        indice,
        descricao,
        ok: false,
        erro: erro instanceof Error ? erro.message : 'erro desconhecido',
      });
    }
  }
  return { cenarioId: cenario.id, ts: Date.now(), ok: acoes.every((a) => a.ok), acoes };
}
