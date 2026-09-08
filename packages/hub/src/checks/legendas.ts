import { consolidarStatus, type PassoCheck, type ResultadoCheck } from '@maestro/shared';
import { ErroDriver } from '../drivers/tipos.js';
import type { ContextoCheck, OpcoesCheckLegendas } from './tipos.js';

/**
 * Verifica a cadeia inteira da legenda: Holyrics → servidor web → fonte de
 * navegador no OBS → imagem realmente chegando.
 *
 * A cadeia tem quatro elos e qualquer um pode estar quebrado sem que os outros
 * denunciem. É por isso que cada etapa reporta seu próprio resultado com uma
 * instrução do que fazer: quem está operando muda toda semana e não tem como
 * adivinhar onde olhar.
 */

const TEXTO_MARCADOR = 'TESTE DE LEGENDA — MAESTRO';
/** Tempo para o Holyrics publicar e o navegador do OBS renderizar. */
const ESPERA_RENDERIZACAO_PADRAO_MS = 1800;
/** Intervalo entre as duas capturas de referência, para detectar animação. */
const ESPERA_REFERENCIA_PADRAO_MS = 400;

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function medir<T>(fn: () => Promise<T>): Promise<{ valor: T; ms: number }> {
  const inicio = Date.now();
  return fn().then((valor) => ({ valor, ms: Date.now() - inicio }));
}

function mensagemDe(err: unknown): string {
  if (err instanceof ErroDriver) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Só o payload base64, sem o prefixo `data:image/png;base64,`. */
function apenasBase64(imagem: string): string {
  const virgula = imagem.indexOf(',');
  return virgula >= 0 ? imagem.slice(virgula + 1) : imagem;
}

export async function checarLegendas(
  ctx: ContextoCheck,
  opcoes: OpcoesCheckLegendas = {},
): Promise<ResultadoCheck> {
  const passos: PassoCheck[] = [];
  const dispositivos = ctx.dispositivos();
  const esperaRenderizacao = opcoes.esperaRenderizacaoMs ?? ESPERA_RENDERIZACAO_PADRAO_MS;
  const esperaReferencia = opcoes.esperaReferenciaMs ?? ESPERA_REFERENCIA_PADRAO_MS;

  const holyrics = opcoes.dispositivoHolyrics
    ? dispositivos.find((d) => d.id === opcoes.dispositivoHolyrics)
    : dispositivos.find((d) => d.servicos.holyrics && d.servicos.holyrics.legendaUrl);

  const obsDisp = opcoes.dispositivoObs
    ? dispositivos.find((d) => d.id === opcoes.dispositivoObs)
    : dispositivos.find((d) => d.servicos.obs?.sourceLegenda);

  // ── 1. O Holyrics está de pé e conversando com o hub? ──────────────────────
  let temApresentacaoNoAr = false;

  if (!holyrics) {
    passos.push({
      id: 'holyrics-configurado',
      titulo: 'Holyrics configurado',
      status: 'falha',
      detalhe: 'Nenhuma máquina tem o Holyrics com URL de legenda configurada.',
      comoResolver:
        'Abra Dispositivos no painel e preencha, na máquina da projeção, a porta e o token do API Server e a URL de legenda usada no OBS.',
    });
    return montar(passos, ctx);
  }

  try {
    const { valor: estado, ms } = await medir(() =>
      ctx.drivers.holyrics.ler(holyrics, { timeoutMs: 3000 }),
    );
    if (estado.online) {
      temApresentacaoNoAr = estado.apresentacao !== null;
      passos.push({
        id: 'holyrics-online',
        titulo: `Holyrics respondendo (${holyrics.nome})`,
        status: 'ok',
        detalhe: temApresentacaoNoAr
          ? `Conectado. No ar agora: ${estado.apresentacao?.nome}.`
          : 'Conectado, sem apresentação no ar.',
        duracaoMs: ms,
      });
    } else {
      passos.push({
        id: 'holyrics-online',
        titulo: `Holyrics respondendo (${holyrics.nome})`,
        status: 'falha',
        detalhe: estado.erro ?? 'Não respondeu.',
        comoResolver: `Abra o Holyrics no ${holyrics.nome} e confira em Arquivo › Configurações › API Server se ele está ativado.`,
        duracaoMs: ms,
      });
      return montar(passos, ctx);
    }
  } catch (err) {
    passos.push({
      id: 'holyrics-online',
      titulo: `Holyrics respondendo (${holyrics.nome})`,
      status: 'falha',
      detalhe: mensagemDe(err),
      comoResolver: `Abra o Holyrics no ${holyrics.nome} e ative o API Server.`,
    });
    return montar(passos, ctx);
  }

  // ── 2. A página que o OBS consome está no ar? ──────────────────────────────
  try {
    const { valor, ms } = await medir(() =>
      ctx.drivers.holyrics.checarPaginaLegenda(holyrics, { timeoutMs: 3000 }),
    );
    passos.push({
      id: 'pagina-legenda',
      titulo: 'Página de legendas no ar',
      status: valor.status === 200 ? 'ok' : 'falha',
      detalhe: `${valor.url} respondeu HTTP ${valor.status}.`,
      comoResolver:
        valor.status === 200
          ? undefined
          : 'Confira no Holyrics se o servidor web está ativado e se a URL configurada aqui é exatamente a mesma da fonte de navegador do OBS.',
      duracaoMs: ms,
    });
  } catch (err) {
    passos.push({
      id: 'pagina-legenda',
      titulo: 'Página de legendas no ar',
      status: 'falha',
      detalhe: mensagemDe(err),
      comoResolver:
        'Ative o servidor web do Holyrics e confirme a URL em Dispositivos, no painel.',
    });
  }

  // ── 3. A fonte de legenda existe e está visível na cena atual do OBS? ──────
  const sourceLegenda = obsDisp?.servicos.obs?.sourceLegenda;

  if (!obsDisp || !sourceLegenda) {
    passos.push({
      id: 'obs-source',
      titulo: 'Fonte de legenda no OBS',
      status: 'pulado',
      detalhe: 'Nenhuma máquina tem o OBS com a fonte de legenda configurada.',
      comoResolver:
        'Em Dispositivos, informe o nome exato da fonte de legenda usada no OBS do PC Transmissão.',
    });
    return montar(passos, ctx);
  }

  try {
    const { valor: visivel, ms } = await medir(() =>
      ctx.drivers.obs.sourceVisivel(obsDisp, sourceLegenda),
    );
    passos.push({
      id: 'obs-source',
      titulo: `Fonte "${sourceLegenda}" visível no OBS`,
      status: visivel ? 'ok' : 'falha',
      detalhe: visivel
        ? 'A fonte está presente na cena atual e com o olho aberto.'
        : 'A fonte não está na cena atual, ou está com o olho fechado.',
      comoResolver: visivel
        ? undefined
        : `No OBS do ${obsDisp.nome}, confira se a fonte "${sourceLegenda}" está na cena que vai ao ar e se o olho está aberto.`,
      duracaoMs: ms,
    });

    // Com a fonte fora do ar, a captura ainda funciona (o OBS renderiza fontes
    // ocultas), então a prova real passaria enquanto o público não vê legenda
    // nenhuma. Melhor não exibir o marcador do que dar esse veredito.
    if (!visivel) {
      passos.push({
        id: 'prova-real',
        titulo: 'Prova real da legenda',
        status: 'pulado',
        detalhe: 'A fonte de legenda não está no ar, então o teste com marcador não foi feito.',
        comoResolver: 'Corrija a visibilidade da fonte no OBS e rode o teste de novo.',
      });
      return montar(passos, ctx);
    }
  } catch (err) {
    passos.push({
      id: 'obs-source',
      titulo: `Fonte "${sourceLegenda}" visível no OBS`,
      status: 'falha',
      detalhe: mensagemDe(err),
      comoResolver: `Abra o OBS no ${obsDisp.nome} e confira se o WebSocket está ativado.`,
    });
    return montar(passos, ctx);
  }

  // ── 4. Prova real: o texto sai do Holyrics e chega mesmo na imagem do OBS? ──
  if (opcoes.provaReal === false) {
    return montar(passos, ctx);
  }

  if (temApresentacaoNoAr) {
    passos.push({
      id: 'prova-real',
      titulo: 'Prova real da legenda',
      status: 'pulado',
      detalhe:
        'Já existe uma apresentação no ar. O teste com texto marcador foi pulado para não interromper o que está sendo exibido.',
      comoResolver:
        'Rode este teste antes do culto começar, com o Holyrics sem nada em exibição.',
    });
    return montar(passos, ctx);
  }

  try {
    const antes1 = apenasBase64(await ctx.drivers.obs.capturarSource(obsDisp, sourceLegenda));
    await dormir(esperaReferencia);
    const antes2 = apenasBase64(await ctx.drivers.obs.capturarSource(obsDisp, sourceLegenda));

    // Se a fonte já muda sozinha entre duas capturas (vídeo, animação, relógio),
    // comparar antes/depois não prova nada — melhor admitir isso do que dar um
    // "ok" que a pessoa vai levar para o ar.
    if (antes1 !== antes2) {
      passos.push({
        id: 'prova-real',
        titulo: 'Prova real da legenda',
        status: 'aviso',
        detalhe:
          'A fonte de legenda muda sozinha entre duas capturas, então não dá para afirmar pela imagem se o texto chegou.',
        comoResolver: `Confira na tela do OBS, a olho nu, se a legenda aparece ao exibir uma música no Holyrics do ${holyrics.nome}.`,
      });
      return montar(passos, ctx);
    }

    const inicio = Date.now();
    await ctx.drivers.holyrics.apresentacaoRapida(holyrics, TEXTO_MARCADOR, { timeoutMs: 3000 });
    try {
      await dormir(esperaRenderizacao);
      const depois = apenasBase64(await ctx.drivers.obs.capturarSource(obsDisp, sourceLegenda));
      const mudou = depois !== antes2;

      passos.push({
        id: 'prova-real',
        titulo: 'Prova real da legenda',
        status: mudou ? 'ok' : 'falha',
        detalhe: mudou
          ? 'O texto de teste saiu do Holyrics e apareceu na imagem do OBS. A legenda está funcionando de ponta a ponta.'
          : 'O texto de teste foi exibido no Holyrics, mas a imagem da fonte no OBS não mudou.',
        comoResolver: mudou
          ? undefined
          : `Atualize a fonte de navegador "${sourceLegenda}" no OBS (botão direito › Atualizar) e confira se a URL dela é a mesma configurada aqui.`,
        duracaoMs: Date.now() - inicio,
      });
    } finally {
      // Tira o marcador do ar mesmo se a captura falhar — deixar "TESTE DE
      // LEGENDA" projetado seria muito pior do que não ter testado.
      await ctx.drivers.holyrics
        .encerrarApresentacao(holyrics, { timeoutMs: 3000 })
        .catch(() => undefined);
    }
  } catch (err) {
    passos.push({
      id: 'prova-real',
      titulo: 'Prova real da legenda',
      status: 'falha',
      detalhe: mensagemDe(err),
      comoResolver:
        'Confira se o token do Holyrics tem permissão para ShowQuickPresentation e CloseCurrentPresentation.',
    });
    await ctx.drivers.holyrics
      .encerrarApresentacao(holyrics, { timeoutMs: 3000 })
      .catch(() => undefined);
  }

  return montar(passos, ctx);
}

function montar(passos: PassoCheck[], ctx: ContextoCheck): ResultadoCheck {
  const status = consolidarStatus(passos);
  const resultado: ResultadoCheck = {
    id: 'legendas',
    titulo: 'Teste de legendas',
    ts: Date.now(),
    status,
    resumo: resumir(status, passos),
    passos,
  };
  ctx.publicar?.(resultado);
  return resultado;
}

function resumir(status: PassoCheck['status'], passos: PassoCheck[]): string {
  if (status === 'ok') {
    // Sem a prova real, o que se sabe é que a cadeia está montada — não que a
    // legenda chegou. Dizer "está chegando" aqui seria vender uma garantia que
    // o teste não deu.
    const pulado = passos.find((p) => p.status === 'pulado');
    if (pulado) {
      return `Tudo que dava para conferir passou, mas ${pulado.titulo.toLowerCase()} ficou de fora.`;
    }
    return 'A legenda está chegando no OBS.';
  }
  const problema = passos.find((p) => p.status === 'falha') ?? passos.find((p) => p.status === 'aviso');
  if (status === 'aviso') return problema ? `Atenção: ${problema.detalhe}` : 'Teste inconclusivo.';
  return problema ? `Quebrou em: ${problema.titulo}.` : 'A legenda não está funcionando.';
}
