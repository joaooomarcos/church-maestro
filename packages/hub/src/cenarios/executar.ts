import {
  ESPERA_ABRIR_PADRAO_S,
  NOMES_APLICATIVOS,
  NOMES_POSICOES_RELOGIO,
  type AcaoCenario,
  type AcaoApp,
  type Aplicativo,
  type Cenario,
  type DispositivoConfig,
  type ResultadoCenario,
} from '@maestro/shared';
import type { ContextoApp } from '../rotas/contexto.js';
import { enviarAviso } from '../avisos/enviar.js';

const VERBOS_APP: Record<AcaoApp, string> = {
  abrir: 'abrir',
  fechar: 'fechar',
  reiniciar: 'reiniciar',
  frente: 'trazer para frente',
};

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
    case 'app.acao':
      return `${nome(acao.dispositivo)} → ${VERBOS_APP[acao.acao]} o ${NOMES_APLICATIVOS[acao.app]}${esperaPronto(acao) ? ' e esperar ficar pronto' : ''}`;
    case 'holyrics.relogio': {
      const partes: string[] = [];
      if (acao.mostrar !== null) partes.push(acao.mostrar ? 'mostrar' : 'esconder');
      if (acao.posicao) partes.push(NOMES_POSICOES_RELOGIO[acao.posicao].toLowerCase());
      return `Holyrics ${nome(acao.dispositivo)} → relógio ${partes.join(', ') || 'sem mudança'}`;
    }
    case 'aviso.mostrar': {
      const destinos = acao.dispositivos.map(nome);
      if (acao.noPainel) destinos.push('painel');
      return `Aviso "${acao.mensagem}" → ${destinos.join(', ') || 'ninguém'}${acao.segundos ? ` (some em ${acao.segundos} s)` : ''}`;
    }
    case 'espera':
      return `Esperar ${formatarEspera(acao.ms)}`;
  }
}

export function formatarEspera(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const segundos = ms / 1000;
  if (segundos < 60 || segundos % 60 !== 0) return `${segundos.toLocaleString('pt-BR')} s`;
  return `${segundos / 60} min`;
}

/** "Esperar abrir" só faz sentido quando o passo abre o programa. */
function esperaPronto(acao: Extract<AcaoCenario, { tipo: 'app.acao' }>): boolean {
  return acao.esperarPronto === true && (acao.acao === 'abrir' || acao.acao === 'reiniciar');
}

const INTERVALO_PRONTO_MS = 1000;

/**
 * Espera o programa ficar pronto de verdade. No Holyrics, o processo e até a
 * janela aparecem bem antes da API responder, e é a API que os passos usam.
 */
async function esperarFicarPronto(
  ctx: ContextoApp,
  dispositivo: DispositivoConfig,
  app: Aplicativo,
  maxSegundos: number,
  intervaloMs = INTERVALO_PRONTO_MS,
): Promise<void> {
  const limite = Date.now() + maxSegundos * 1000;
  const pelaApi = app === 'holyrics' && dispositivo.servicos.holyrics !== undefined;
  let ultimoErro: string | null = null;
  for (;;) {
    if (pelaApi) {
      const estado = await ctx.drivers.holyrics.ler(dispositivo, { timeoutMs: 1500 });
      if (estado.online) return;
      ultimoErro = estado.erro;
    } else {
      try {
        if (await ctx.drivers.agente.janelaAberta(dispositivo, app)) return;
      } catch (erro) {
        ultimoErro = erro instanceof Error ? erro.message : String(erro);
      }
    }
    if (Date.now() + intervaloMs > limite) break;
    await esperar(intervaloMs);
  }
  throw new Error(
    `o ${NOMES_APLICATIVOS[app]} não ficou pronto em ${maxSegundos} s${ultimoErro ? ` (${ultimoErro})` : ''}`,
  );
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executarAcao(ctx: ContextoApp, acao: AcaoCenario, intervaloPronto?: number): Promise<void> {
  if (acao.tipo === 'espera') {
    await esperar(acao.ms);
    return;
  }
  if (acao.tipo === 'aviso.mostrar') {
    const { falhas } = await enviarAviso(ctx, acao);
    if (falhas.length > 0) throw new Error(falhas.join('; '));
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
    case 'app.acao':
      await ctx.drivers.agente.acaoApp(dispositivo, { app: acao.app, acao: acao.acao });
      if (esperaPronto(acao)) {
        await esperarFicarPronto(ctx, dispositivo, acao.app, acao.esperaMaxSegundos ?? ESPERA_ABRIR_PADRAO_S, intervaloPronto);
      }
      return;
    case 'holyrics.relogio':
      await ctx.drivers.holyrics.definirRelogio(dispositivo, {
        ...(acao.mostrar !== null ? { mostrar: acao.mostrar } : {}),
        ...(acao.posicao ? { posicao: acao.posicao } : {}),
      });
      return;
  }
}

/**
 * Roda os passos em ordem. Um passo que falha não interrompe os outros: no
 * meio do culto, é melhor o datashow trocar de fonte mesmo que o Holyrics não
 * tenha respondido. A exceção é o "Abrir" com "esperar abrir": quem marcou
 * disse que o resto depende do programa, então o resto não roda.
 */
export async function executarCenario(
  ctx: ContextoApp,
  cenario: Cenario,
  opcoes: { intervaloProntoMs?: number } = {},
): Promise<ResultadoCenario> {
  const acoes: ResultadoCenario['acoes'] = [];
  let interrompidoPor: string | null = null;
  for (const [indice, acao] of cenario.acoes.entries()) {
    const descricao = descreverAcao(acao, ctx);
    if (interrompidoPor) {
      acoes.push({ indice, descricao, ok: false, pulado: true, erro: `não rodou: ${interrompidoPor}` });
      continue;
    }
    try {
      await executarAcao(ctx, acao, opcoes.intervaloProntoMs);
      acoes.push({ indice, descricao, ok: true });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : 'erro desconhecido';
      acoes.push({ indice, descricao, ok: false, erro: mensagem });
      if (acao.tipo === 'app.acao' && esperaPronto(acao)) {
        interrompidoPor = `o ${NOMES_APLICATIVOS[acao.app]} não abriu`;
      }
    }
  }
  return { cenarioId: cenario.id, ts: Date.now(), ok: acoes.every((a) => a.ok), acoes };
}
