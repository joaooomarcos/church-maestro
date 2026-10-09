import {
  consolidarStatus,
  descreverFaixa,
  faixaProibidaAgora,
  resolverLegendas,
  usaHolyrics,
  type ConfigLegendas,
  type DispositivoConfig,
  type EstadoHolyrics,
  type EstadoObs,
  type PassoCheck,
  type ResultadoCheck,
} from '@maestro/shared';
import { ErroDriver, type GatilhoHolyrics } from '../drivers/tipos.js';
import type { ContextoCheck, OpcoesCheckLegendas } from './tipos.js';

/**
 * Teste das legendas da transmissão, do jeito que elas funcionam na igreja:
 *
 *   Holyrics exibe → publica numa página web → gatilho do Holyrics abre o
 *   GRUPO (música ou leitura) no OBS → a fonte web daquele Holyrics, sempre
 *   ligada dentro do grupo, mostra o conteúdo.
 *
 * Para cada Holyrics usado, um de cada vez: confere os gatilhos, exibe a
 * primeira música da lista e depois um versículo, e prova (a) que o grupo
 * abriu e fechou sozinho e (b) que a fonte web dele mudou de imagem. A falha
 * mais comum — o Holyrics aberto depois do OBS, deixando a fonte vazia — sai
 * com o botão "Atualizar fonte".
 *
 * Por segurança o teste não roda com o OBS transmitindo ou gravando, em
 * horário proibido ou com algo no ar no Holyrics. "Forçar" passa por cima dos
 * dois primeiros, nunca do último.
 */

const ESPERA_RENDERIZACAO_PADRAO_MS = 1800;
const ESPERA_REFERENCIA_PADRAO_MS = 400;
const ESPERA_GRUPO_PADRAO_MS = 3000;
const INTERVALO_GRUPO_PADRAO_MS = 150;
const TIMEOUT_HOLYRICS_MS = 3000;

const dormir = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function mensagemDe(err: unknown): string {
  if (err instanceof ErroDriver) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Só o payload base64, sem o prefixo `data:image/png;base64,`. */
function apenasBase64(imagem: string): string {
  const virgula = imagem.indexOf(',');
  return virgula >= 0 ? imagem.slice(virgula + 1) : imagem;
}

/** Dois testes ao mesmo tempo exibiriam coisas um por cima do outro. */
let testeEmAndamento = false;

type Papel = 'musica' | 'leitura';

const NOMES_PAPEL: Record<Papel, { titulo: string; gatilho: string }> = {
  musica: { titulo: 'Música', gatilho: 'música' },
  leitura: { titulo: 'Leitura', gatilho: 'texto bíblico' },
};

/** Os quatro gatilhos que a montagem precisa, por Holyrics. */
const GATILHOS_NECESSARIOS: Array<{ quando: string; tipos: string[]; nome: string }> = [
  { quando: 'displaying', tipos: ['any_song', 'any_song_slide'], nome: 'ao exibir música' },
  { quando: 'closing', tipos: ['any_song'], nome: 'ao encerrar música' },
  { quando: 'displaying', tipos: ['any_verse'], nome: 'ao exibir texto bíblico' },
  { quando: 'closing', tipos: ['any_verse'], nome: 'ao encerrar texto bíblico' },
];

export function conferirGatilhos(gatilhos: GatilhoHolyrics[]): { faltando: string[]; desligados: string[] } {
  const faltando: string[] = [];
  const desligados: string[] = [];
  for (const necessario of GATILHOS_NECESSARIOS) {
    const candidatos = gatilhos.filter((g) => g.quando === necessario.quando && necessario.tipos.includes(g.tipo));
    if (candidatos.length === 0) faltando.push(necessario.nome);
    else if (!candidatos.some((g) => g.ativo)) desligados.push(necessario.nome);
  }
  return { faltando, desligados };
}

class Execucao {
  readonly passos: PassoCheck[] = [];
  bloqueio: ResultadoCheck['bloqueio'];

  constructor(private readonly ctx: ContextoCheck) {}

  adicionar(passo: PassoCheck): void {
    this.passos.push(passo);
    // Resultado parcial: o teste leva uns 15 segundos e a tela mostra o andamento.
    this.ctx.publicar?.(this.montar());
  }

  montar(): ResultadoCheck {
    const status = this.bloqueio ? 'pulado' : consolidarStatus(this.passos);
    return {
      id: 'legendas',
      titulo: 'Teste de legendas',
      ts: Date.now(),
      status,
      resumo: this.bloqueio ? `Teste não executado: ${this.bloqueio.motivo}` : resumir(status, this.passos),
      passos: [...this.passos],
      ...(this.bloqueio ? { bloqueio: this.bloqueio } : {}),
    };
  }
}

export async function checarLegendas(
  ctx: ContextoCheck,
  opcoes: OpcoesCheckLegendas = {},
): Promise<ResultadoCheck> {
  const exec = new Execucao(ctx);

  if (testeEmAndamento) {
    exec.bloqueio = { motivo: 'já existe um teste de legendas rodando.', podeForcar: false };
    // Sem publicar: quem acompanha o teste em andamento não pode ver este resultado no lugar do dele.
    exec.passos.push({
      id: 'bloqueio',
      titulo: 'Teste não executado',
      status: 'pulado',
      detalhe: 'Outro teste de legendas está rodando agora.',
      comoResolver: 'Espere ele terminar e veja o resultado nesta tela.',
    });
    return exec.montar();
  }

  testeEmAndamento = true;
  try {
    await executar(ctx, opcoes, exec);
  } finally {
    testeEmAndamento = false;
  }
  const final = exec.montar();
  ctx.publicar?.(final);
  return final;
}

async function executar(ctx: ContextoCheck, opcoes: OpcoesCheckLegendas, exec: Execucao): Promise<void> {
  const dispositivos = ctx.dispositivos();
  const resolvidas = resolverLegendas(dispositivos);

  if (!resolvidas) {
    exec.adicionar({
      id: 'configuracao',
      titulo: 'Legendas configuradas',
      status: 'falha',
      detalhe: 'Nenhuma máquina tem o OBS com as fontes de legenda configuradas.',
      comoResolver:
        'Em Sistema › Ajustes › Legendas, escolha a cena, os grupos de música e de leitura e a fonte de cada Holyrics.',
    });
    return;
  }

  const { obs, config, legado } = resolvidas;
  const alvos = dispositivos
    .filter(usaHolyrics)
    .filter((d) => !opcoes.holyrics || opcoes.holyrics.includes(d.id));

  if (alvos.length === 0) {
    exec.adicionar({
      id: 'configuracao',
      titulo: 'Holyrics para testar',
      status: 'falha',
      detalhe: 'Nenhuma máquina está marcada como usando o Holyrics.',
      comoResolver: 'Em Sistema › Ajustes › Programas de cada máquina, marque o Holyrics nas máquinas que o usam.',
    });
    return;
  }

  // ── Segurança: só depois disso o teste pode exibir alguma coisa ──────────────
  const [estadoObs, estadosHolyrics] = await Promise.all([
    lerObs(ctx, obs),
    Promise.all(alvos.map(async (d) => [d.id, await lerHolyrics(ctx, d)] as const)),
  ]);
  const holyricsPorId = new Map<string, EstadoHolyrics>(estadosHolyrics);

  const motivos: string[] = [];
  let podeForcar = true;

  for (const alvo of alvos) {
    const apresentacao = holyricsPorId.get(alvo.id)?.apresentacao;
    if (apresentacao) {
      motivos.push(`o Holyrics do ${alvo.nome} está exibindo "${apresentacao.nome}"`);
      podeForcar = false;
    }
  }
  if (!opcoes.forcar) {
    const faixa = faixaProibidaAgora(config.horariosProibidos, (opcoes.agora ?? (() => new Date()))());
    if (faixa) motivos.push(`horário proibido para testes (${descreverFaixa(faixa)})`);
    if (estadoObs.online && (estadoObs.transmitindo || estadoObs.gravando)) {
      motivos.push(`o OBS do ${obs.nome} está ${estadoObs.transmitindo ? 'transmitindo' : 'gravando'}`);
    }
  }

  if (motivos.length > 0) {
    const motivo = motivos.join('; ');
    exec.bloqueio = { motivo, podeForcar };
    exec.adicionar({
      id: 'bloqueio',
      titulo: 'Teste não executado',
      status: 'pulado',
      detalhe: `Por segurança o teste não rodou: ${motivo}. Ele exibe uma música e um versículo, que iriam para o telão e para a transmissão.`,
      comoResolver: podeForcar
        ? 'Rode antes do culto, com o OBS fora do ar. Se precisar mesmo agora, use "Forçar teste".'
        : 'Encerre a apresentação no Holyrics (ou espere ela terminar) e rode o teste de novo.',
    });
    return;
  }

  if (!estadoObs.online) {
    for (const alvo of alvos) {
      exec.adicionar({
        id: `${alvo.id}:holyrics`,
        grupo: alvo.nome,
        titulo: `Legendas do ${alvo.nome}`,
        status: 'falha',
        detalhe: `O OBS do ${obs.nome} não respondeu: ${estadoObs.erro ?? 'sem resposta'}.`,
        comoResolver: `Ligue o OBS do ${obs.nome} (com o WebSocket ativado) e rode o teste de novo.`,
      });
    }
    return;
  }

  // ── Estrutura no OBS: cena e grupos existem? ─────────────────────────────────
  const itensDosGrupos = legado ? null : await conferirEstrutura(ctx, exec, obs, config);
  if (!legado && !itensDosGrupos) return;

  if (legado) {
    exec.adicionar({
      id: 'configuracao',
      titulo: 'Configuração das legendas',
      status: 'aviso',
      detalhe: `Configuração antiga: só a fonte "${obs.servicos.obs?.sourceLegenda}" é testada, sem os grupos nem a leitura.`,
      comoResolver: 'Em Sistema › Ajustes › Legendas, escolha a cena, os grupos e as fontes de cada Holyrics.',
    });
  }

  // ── Um Holyrics por vez ──────────────────────────────────────────────────────
  for (const alvo of alvos) {
    await testarHolyrics(ctx, opcoes, exec, {
      obs,
      config,
      legado,
      holyrics: alvo,
      estado: holyricsPorId.get(alvo.id) ?? { online: false, erro: 'sem resposta', apresentacao: null },
      itensDosGrupos,
    });
  }
}

async function lerObs(ctx: ContextoCheck, obs: DispositivoConfig): Promise<EstadoObs> {
  try {
    return await ctx.drivers.obs.ler(obs);
  } catch (err) {
    return {
      online: false,
      erro: mensagemDe(err),
      cenaAtual: null,
      cenas: [],
      transmitindo: false,
      gravando: false,
      tempoTransmissaoS: 0,
      bitrateKbps: 0,
      framesPerdidos: 0,
      percFramesPerdidos: 0,
    };
  }
}

async function lerHolyrics(ctx: ContextoCheck, d: DispositivoConfig): Promise<EstadoHolyrics> {
  try {
    return await ctx.drivers.holyrics.ler(d, { timeoutMs: TIMEOUT_HOLYRICS_MS });
  } catch (err) {
    return { online: false, erro: mensagemDe(err), apresentacao: null };
  }
}

/** Itens de cada grupo, por nome do grupo — ou null se a estrutura não bate. */
async function conferirEstrutura(
  ctx: ContextoCheck,
  exec: Execucao,
  obs: DispositivoConfig,
  config: ConfigLegendas,
): Promise<Map<string, Set<string>> | null> {
  const faltaConfig = [
    !config.cena && 'a cena',
    !config.grupoMusica && 'o grupo da música',
    !config.grupoLeitura && 'o grupo da leitura',
  ].filter((x): x is string => Boolean(x));

  if (faltaConfig.length > 0) {
    exec.adicionar({
      id: 'estrutura-obs',
      titulo: 'Legendas configuradas',
      status: 'falha',
      detalhe: `Falta escolher ${faltaConfig.join(', ')}.`,
      comoResolver: 'Em Sistema › Ajustes › Legendas, complete a configuração (o painel sugere os nomes do OBS).',
    });
    return null;
  }

  try {
    const estrutura = await ctx.drivers.obs.estrutura(obs);
    const cena = estrutura.cenas.find((c) => c.nome === config.cena);
    const problemas: string[] = [];
    if (!cena) {
      problemas.push(`a cena "${config.cena}" não existe`);
    } else {
      for (const grupo of [config.grupoMusica, config.grupoLeitura]) {
        if (!cena.itens.some((i) => i.nome === grupo)) problemas.push(`o grupo "${grupo}" não está na cena "${config.cena}"`);
      }
    }
    if (problemas.length > 0) {
      exec.adicionar({
        id: 'estrutura-obs',
        titulo: 'Cena e grupos no OBS',
        status: 'falha',
        detalhe: `No OBS do ${obs.nome}, ${problemas.join('; ')}.`,
        comoResolver: 'Confira os nomes em Sistema › Ajustes › Legendas: eles precisam ser exatamente os do OBS.',
      });
      return null;
    }
    exec.adicionar({
      id: 'estrutura-obs',
      titulo: 'Cena e grupos no OBS',
      status: 'ok',
      detalhe: `"${config.cena}" tem os grupos "${config.grupoMusica}" e "${config.grupoLeitura}".`,
    });
    return new Map(estrutura.grupos.map((g) => [g.nome, new Set(g.itens.map((i) => i.nome))]));
  } catch (err) {
    exec.adicionar({
      id: 'estrutura-obs',
      titulo: 'Cena e grupos no OBS',
      status: 'falha',
      detalhe: mensagemDe(err),
      comoResolver: `Abra o OBS no ${obs.nome} e confira se o WebSocket está ativado.`,
    });
    return null;
  }
}

interface AlvoHolyrics {
  obs: DispositivoConfig;
  config: ConfigLegendas;
  legado: boolean;
  holyrics: DispositivoConfig;
  estado: EstadoHolyrics;
  itensDosGrupos: Map<string, Set<string>> | null;
}

async function testarHolyrics(
  ctx: ContextoCheck,
  opcoes: OpcoesCheckLegendas,
  exec: Execucao,
  alvo: AlvoHolyrics,
): Promise<void> {
  const { holyrics, estado, config, legado } = alvo;
  const grupo = holyrics.nome;

  if (!estado.online) {
    exec.adicionar({
      id: `${holyrics.id}:holyrics`,
      grupo,
      titulo: `Holyrics do ${holyrics.nome}`,
      status: 'falha',
      detalhe: estado.erro ?? 'Não respondeu.',
      comoResolver: `Ligue o ${holyrics.nome} e abra o Holyrics (com o API Server ativado em Arquivo › Configurações › API Server). Depois rode o teste de novo.`,
    });
    return;
  }
  exec.adicionar({
    id: `${holyrics.id}:holyrics`,
    grupo,
    titulo: `Holyrics do ${holyrics.nome}`,
    status: 'ok',
    detalhe: 'Respondendo, sem nada no ar.',
  });

  const fontes = config.holyrics.find((h) => h.dispositivo === holyrics.id);
  if (!fontes || (!fontes.fonteMusica && !fontes.fonteLeitura)) {
    exec.adicionar({
      id: `${holyrics.id}:config`,
      grupo,
      titulo: 'Fontes deste Holyrics',
      status: 'falha',
      detalhe: `Não está dito quais fontes do OBS são do Holyrics do ${holyrics.nome}.`,
      comoResolver: 'Em Sistema › Ajustes › Legendas, escolha a fonte de música e a de leitura deste Holyrics.',
    });
    return;
  }

  if (!legado) await testarGatilhos(ctx, exec, holyrics);

  // ── Música ──
  if (fontes.fonteMusica) {
    let playlist;
    try {
      playlist = await ctx.drivers.holyrics.listarPlaylist(holyrics, { timeoutMs: TIMEOUT_HOLYRICS_MS });
    } catch (err) {
      exec.adicionar({
        id: `${holyrics.id}:musica`,
        grupo,
        titulo: `Música — ${holyrics.nome}`,
        status: 'falha',
        detalhe: mensagemDe(err),
        comoResolver: 'Confira se o token do Holyrics tem a permissão GetLyricsPlaylist.',
      });
      playlist = null;
    }
    const primeira = playlist?.[0];
    if (playlist && !primeira) {
      exec.adicionar({
        id: `${holyrics.id}:musica`,
        grupo,
        titulo: `Música — ${holyrics.nome}`,
        status: 'falha',
        detalhe: 'A lista de reprodução do Holyrics está vazia, então não há música para exibir no teste.',
        comoResolver: `No Holyrics do ${holyrics.nome}, adicione qualquer música à lista de reprodução (o teste usa a primeira) e rode de novo.`,
      });
    } else if (primeira) {
      exec.adicionar(
        await roteiro(ctx, opcoes, alvo, {
          papel: 'musica',
          fonte: fontes.fonteMusica,
          grupoObs: legado ? undefined : config.grupoMusica,
          descricao: `a música "${primeira.titulo}"`,
          exibir: () => ctx.drivers.holyrics.mostrarLetra(holyrics, primeira.id, { timeoutMs: TIMEOUT_HOLYRICS_MS }),
        }),
      );
    }
  }

  // ── Leitura ──
  if (fontes.fonteLeitura && !legado) {
    exec.adicionar(
      await roteiro(ctx, opcoes, alvo, {
        papel: 'leitura',
        fonte: fontes.fonteLeitura,
        grupoObs: config.grupoLeitura,
        descricao: `o versículo ${config.versiculo}`,
        exibir: () =>
          ctx.drivers.holyrics.mostrarVersiculo(holyrics, config.versiculo, { timeoutMs: TIMEOUT_HOLYRICS_MS }),
      }),
    );
  }
}

async function testarGatilhos(ctx: ContextoCheck, exec: Execucao, holyrics: DispositivoConfig): Promise<void> {
  const base = { id: `${holyrics.id}:gatilhos`, grupo: holyrics.nome, titulo: 'Gatilhos do Holyrics' };
  try {
    const gatilhos = await ctx.drivers.holyrics.listarGatilhos(holyrics, { timeoutMs: TIMEOUT_HOLYRICS_MS });
    const { faltando, desligados } = conferirGatilhos(gatilhos);
    if (faltando.length === 0 && desligados.length === 0) {
      exec.adicionar({ ...base, status: 'ok', detalhe: 'Os 4 gatilhos (exibir e encerrar música e texto bíblico) estão ativos.' });
      return;
    }
    const partes = [
      faltando.length > 0 && `faltando: ${faltando.join(', ')}`,
      desligados.length > 0 && `desligados: ${desligados.join(', ')}`,
    ].filter(Boolean);
    exec.adicionar({
      ...base,
      status: 'falha',
      detalhe: `Gatilhos do OBS ${partes.join('; ')}.`,
      comoResolver: `No Holyrics do ${holyrics.nome}, abra os gatilhos e crie (ou ative) um gatilho para cada caso, abrindo e fechando o grupo da legenda no OBS.`,
    });
  } catch (err) {
    // Holyrics antigo (antes da 2.24) ou token sem permissão: o teste segue,
    // porque abrir e fechar o grupo já prova os gatilhos na prática.
    exec.adicionar({
      ...base,
      status: 'aviso',
      detalhe: `Não deu para listar os gatilhos: ${mensagemDe(err)}`,
      comoResolver: 'Dê ao token do Holyrics a permissão GetTriggers (precisa do Holyrics 2.24 ou mais novo).',
    });
  }
}

interface Cenario {
  papel: Papel;
  fonte: string;
  /** Grupo que o gatilho abre; ausente na configuração antiga. */
  grupoObs: string | undefined;
  descricao: string;
  exibir: () => Promise<void>;
}

/**
 * Exibe uma coisa no Holyrics e confere o caminho até o OBS. Sempre encerra a
 * apresentação e deixa o grupo fechado, mesmo se algo der errado no meio.
 */
async function roteiro(
  ctx: ContextoCheck,
  opcoes: OpcoesCheckLegendas,
  alvo: AlvoHolyrics,
  cenario: Cenario,
): Promise<PassoCheck> {
  const { obs, holyrics, config } = alvo;
  const nomes = NOMES_PAPEL[cenario.papel];
  const base = {
    id: `${holyrics.id}:${cenario.papel}`,
    grupo: holyrics.nome,
    titulo: `${nomes.titulo} — ${holyrics.nome} ("${cenario.fonte}")`,
  };
  const esperaRenderizacao = opcoes.esperaRenderizacaoMs ?? ESPERA_RENDERIZACAO_PADRAO_MS;
  const esperaReferencia = opcoes.esperaReferenciaMs ?? ESPERA_REFERENCIA_PADRAO_MS;
  const cena = config.cena;
  const grupoObs = cenario.grupoObs;
  const comGrupo = Boolean(cena && grupoObs);

  if (grupoObs && alvo.itensDosGrupos && !alvo.itensDosGrupos.get(grupoObs)?.has(cenario.fonte)) {
    return {
      ...base,
      status: 'falha',
      detalhe: `A fonte "${cenario.fonte}" não está dentro do grupo "${grupoObs}" no OBS.`,
      comoResolver: 'Confira o nome da fonte em Sistema › Ajustes › Legendas, ou arraste a fonte para dentro do grupo no OBS.',
    };
  }

  const inicio = Date.now();
  const capturar = async (): Promise<string> => apenasBase64(await ctx.drivers.obs.capturarSource(obs, cenario.fonte));
  const grupoVisivel = (): Promise<boolean> =>
    ctx.drivers.obs.itemVisivel(obs, cena as string, grupoObs as string);
  const esperarGrupo = async (alvoVisivel: boolean): Promise<boolean> => {
    const limite = Date.now() + (opcoes.esperaGrupoMs ?? ESPERA_GRUPO_PADRAO_MS);
    for (;;) {
      if ((await grupoVisivel()) === alvoVisivel) return true;
      if (Date.now() >= limite) return false;
      await dormir(opcoes.intervaloGrupoMs ?? INTERVALO_GRUPO_PADRAO_MS);
    }
  };

  const observacoes: string[] = [];
  const problemas: Array<{ detalhe: string; resolver: string }> = [];
  let semConteudo = false;

  try {
    if (comGrupo && (await grupoVisivel())) {
      // Grupo aberto sem nada no ar é sobra de antes; fechado, dá para provar o gatilho.
      await ctx.drivers.obs.definirItemVisivel(obs, cena as string, grupoObs as string, false);
      observacoes.push(`O grupo "${grupoObs}" estava aberto sem nada no ar; o teste o fechou antes de começar.`);
    }

    const referencia1 = await capturar();
    await dormir(esperaReferencia);
    const referencia2 = await capturar();
    if (referencia1 !== referencia2) {
      return {
        ...base,
        status: 'aviso',
        detalhe: `A fonte "${cenario.fonte}" muda sozinha entre duas capturas, então não dá para afirmar pela imagem se o conteúdo chega.`,
        comoResolver: `Confira a olho nu no OBS se a legenda aparece ao exibir ${cenario.descricao} no Holyrics do ${holyrics.nome}.`,
        duracaoMs: Date.now() - inicio,
      };
    }

    let grupoAbriu: boolean | null = null;
    let grupoFechou: boolean | null = null;
    try {
      await cenario.exibir();
      if (comGrupo) grupoAbriu = await esperarGrupo(true);
      await dormir(esperaRenderizacao);
      const depois = await capturar();
      semConteudo = depois === referencia2;
    } finally {
      // Tirar do ar vem antes de qualquer veredito.
      await ctx.drivers.holyrics
        .encerrarApresentacao(holyrics, { timeoutMs: TIMEOUT_HOLYRICS_MS })
        .catch(() => undefined);
      if (comGrupo) {
        grupoFechou = await esperarGrupo(false).catch(() => false);
        if (!grupoFechou) {
          await ctx.drivers.obs
            .definirItemVisivel(obs, cena as string, grupoObs as string, false)
            .catch(() => undefined);
        }
      }
    }

    if (grupoAbriu === false) {
      problemas.push({
        detalhe: `o grupo "${grupoObs}" não abriu`,
        resolver: `No Holyrics do ${holyrics.nome}, confira o gatilho "ao exibir ${nomes.gatilho}": ele precisa abrir o grupo "${grupoObs}" no OBS.`,
      });
    }
    if (grupoFechou === false) {
      problemas.push({
        detalhe: `o grupo "${grupoObs}" não fechou ao encerrar (o teste fechou)`,
        resolver: `No Holyrics do ${holyrics.nome}, confira o gatilho "ao encerrar ${nomes.gatilho}": ele precisa fechar o grupo "${grupoObs}".`,
      });
    }
    if (semConteudo) {
      const url = await conferirUrl(ctx, obs, holyrics, cenario.fonte);
      problemas.unshift({
        detalhe: `a fonte "${cenario.fonte}" continuou vazia`,
        resolver:
          `No OBS do ${obs.nome}, atualize a fonte web "${cenario.fonte}" (botão direito › Atualizar) — acontece quando o Holyrics é aberto depois do OBS.` +
          (url ? ` ${url}` : ''),
      });
    }
  } catch (err) {
    return {
      ...base,
      status: 'falha',
      detalhe: mensagemDe(err),
      comoResolver: `Confira se o OBS do ${obs.nome} está aberto e se o token do Holyrics tem as permissões ShowSong, ShowVerse e CloseCurrentPresentation.`,
      duracaoMs: Date.now() - inicio,
    };
  }

  const duracaoMs = Date.now() - inicio;
  const extra = observacoes.length > 0 ? ` ${observacoes.join(' ')}` : '';

  if (problemas.length === 0) {
    return {
      ...base,
      status: 'ok',
      detalhe: comGrupo
        ? `O Holyrics exibiu ${cenario.descricao}, o grupo "${grupoObs}" abriu e fechou sozinho e a fonte mostrou o conteúdo.${extra}`
        : `O Holyrics exibiu ${cenario.descricao} e a fonte mostrou o conteúdo.${extra}`,
      duracaoMs,
    };
  }

  return {
    ...base,
    status: 'falha',
    detalhe: `O Holyrics exibiu ${cenario.descricao}, mas ${problemas.map((p) => p.detalhe).join('; ')}.${extra}`,
    comoResolver: problemas.map((p) => p.resolver).join(' '),
    duracaoMs,
    ...(semConteudo
      ? {
          acao: {
            tipo: 'atualizar-fonte-obs' as const,
            dispositivo: obs.id,
            fonte: cenario.fonte,
            holyrics: holyrics.id,
            rotulo: 'Atualizar fonte',
          },
        }
      : {}),
  };
}

/**
 * Se a fonte aponta para outra máquina que não a do Holyrics, atualizar não
 * resolve — vale dizer isso junto. Devolve a frase extra, ou null.
 */
async function conferirUrl(
  ctx: ContextoCheck,
  obs: DispositivoConfig,
  holyrics: DispositivoConfig,
  fonte: string,
): Promise<string | null> {
  if (!holyrics.host) return null;
  try {
    const url = await ctx.drivers.obs.urlDaFonte(obs, fonte);
    if (!url) return null;
    const host = new URL(url).hostname;
    if (host === holyrics.host) return null;
    return `Se não resolver: a fonte abre ${url}, mas o Holyrics do ${holyrics.nome} está em ${holyrics.host} — corrija a URL nas propriedades da fonte.`;
  } catch {
    return null;
  }
}

function resumir(status: PassoCheck['status'], passos: PassoCheck[]): string {
  const cenarios = passos.filter((p) => p.id.endsWith(':musica') || p.id.endsWith(':leitura'));
  if (status === 'ok') {
    const pulado = passos.find((p) => p.status === 'pulado');
    if (pulado) return `Tudo que dava para conferir passou, mas "${pulado.titulo}" ficou de fora.`;
    return cenarios.length > 0
      ? `As ${cenarios.length} legendas testadas estão chegando no OBS.`
      : 'Tudo certo.';
  }
  if (status === 'aviso') {
    const aviso = passos.find((p) => p.status === 'aviso');
    return aviso ? `Atenção: ${aviso.detalhe}` : 'Teste inconclusivo.';
  }
  const falhas = passos.filter((p) => p.status === 'falha');
  const vazias = falhas.filter((p) => p.acao?.tipo === 'atualizar-fonte-obs').map((p) => `"${p.acao?.fonte}"`);
  if (vazias.length > 0) {
    const resto = falhas.length - vazias.length;
    return (
      `${vazias.length === 1 ? 'Fonte sem conteúdo' : 'Fontes sem conteúdo'}: ${vazias.join(', ')} — atualize no OBS.` +
      (resto > 0 ? ` E mais ${resto} ${resto === 1 ? 'problema' : 'problemas'} abaixo.` : '')
    );
  }
  if (falhas.length === 1) return `Quebrou em: ${falhas[0]?.titulo}.`;
  return `${falhas.length} problemas: ${falhas.map((p) => p.titulo).join('; ')}.`;
}
