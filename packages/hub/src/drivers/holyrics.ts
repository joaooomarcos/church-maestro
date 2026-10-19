import { ErroDriver, type DriverHolyrics, type GatilhoHolyrics, type OpcoesRequisicao } from './tipos.js';
import { POSICOES_RELOGIO, type EstadoRelogio, type MudancaRelogio, type PosicaoRelogio } from '@maestro/shared';
import type {
  DispositivoConfig,
  EstadoHolyrics,
  ApresentacaoHolyrics,
  ItemPlaylistHolyrics,
} from '@maestro/shared';

/**
 * API Server do Holyrics (Arquivo › Configurações › API Server), porta 8091 por
 * padrão. Toda chamada é POST com corpo JSON e o token na query string:
 *
 *   POST http://ip:8091/api/{acao}?token=abcdef
 *
 * A resposta é sempre `{"status":"ok","data":...}` ou `{"status":"error","error":"..."}`,
 * inclusive com HTTP 200 — então checar `resposta.ok` não basta, é preciso ler
 * o campo `status` do corpo.
 */

const TIMEOUT_PADRAO_MS = 1500;

interface RespostaHolyrics<T> {
  status: 'ok' | 'error';
  data?: T;
  error?: string;
}

/** Traduz os erros mais comuns da API para algo acionável na tela. */
function mensagemDeErro(erroApi: string, acao: string): string {
  const normalizado = erroApi.toLowerCase();
  if (normalizado.includes('token')) {
    return 'O Holyrics recusou o token de acesso. Confira o token em Arquivo › Configurações › API Server.';
  }
  if (normalizado.includes('permission') || normalizado.includes('permiss')) {
    return `O token do Holyrics não tem permissão para "${acao}". Habilite essa ação em "gerenciar permissões".`;
  }
  return `O Holyrics recusou a ação "${acao}": ${erroApi}`;
}

async function chamar<T>(
  dispositivo: DispositivoConfig,
  acao: string,
  corpo: Record<string, unknown>,
  op: OpcoesRequisicao | undefined,
): Promise<T | undefined> {
  const cfg = dispositivo.servicos.holyrics;
  if (!cfg) {
    throw new ErroDriver(`O dispositivo "${dispositivo.nome}" não tem o Holyrics configurado.`);
  }
  if (!dispositivo.host) {
    throw new ErroDriver(`O dispositivo "${dispositivo.nome}" está sem endereço de rede.`);
  }

  const url = `http://${dispositivo.host}:${cfg.porta}/api/${acao}?token=${encodeURIComponent(cfg.token)}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: op?.sinal ?? AbortSignal.timeout(op?.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });
  } catch (err) {
    const causa = err instanceof Error ? err.message : String(err);
    throw new ErroDriver(
      `Não foi possível falar com o Holyrics do ${dispositivo.nome}. Verifique se o programa está aberto e se o API Server está ativado.`,
      causa,
    );
  }

  if (resposta.status === 401 || resposta.status === 403) {
    throw new ErroDriver(
      'O Holyrics recusou o token de acesso. Confira o token em Arquivo › Configurações › API Server.',
      `HTTP ${resposta.status}`,
    );
  }
  if (!resposta.ok) {
    throw new ErroDriver(
      `O Holyrics do ${dispositivo.nome} respondeu com erro ao executar "${acao}".`,
      `HTTP ${resposta.status}`,
    );
  }

  const corpoResposta = (await resposta.json().catch(() => null)) as RespostaHolyrics<T> | null;
  if (!corpoResposta) {
    throw new ErroDriver(`O Holyrics devolveu uma resposta ilegível para "${acao}".`);
  }
  if (corpoResposta.status === 'error') {
    throw new ErroDriver(mensagemDeErro(corpoResposta.error ?? 'erro desconhecido', acao));
  }
  return corpoResposta.data;
}

interface ApresentacaoBruta {
  id?: string;
  type?: string;
  name?: string;
  slide_number?: number;
  total_slides?: number;
  slide_type?: string;
}

export function normalizarApresentacao(bruta: unknown): ApresentacaoHolyrics | null {
  if (bruta === null || bruta === undefined || typeof bruta !== 'object') return null;
  const a = bruta as ApresentacaoBruta;
  return {
    id: a.id ?? '',
    tipo: a.type ?? 'desconhecido',
    // Verso e apresentação rápida costumam vir sem nome.
    nome: a.name && a.name.length > 0 ? a.name : rotularSemNome(a.type),
    slide: typeof a.slide_number === 'number' ? a.slide_number : null,
    totalSlides: typeof a.total_slides === 'number' ? a.total_slides : null,
    tipoSlide: a.slide_type ?? null,
  };
}

interface ItemPlaylistBruto {
  id?: string | number;
  title?: string;
  artist?: string;
}

/** A API devolve a lista como array de `{ id, title, ... }`; o que não tem id não dá para tocar. */
export function normalizarPlaylist(bruta: unknown): ItemPlaylistHolyrics[] {
  if (!Array.isArray(bruta)) return [];
  const itens: ItemPlaylistHolyrics[] = [];
  for (const elemento of bruta as ItemPlaylistBruto[]) {
    if (elemento === null || typeof elemento !== 'object') continue;
    if (elemento.id === undefined || elemento.id === null || elemento.id === '') continue;
    itens.push({
      id: String(elemento.id),
      titulo: elemento.title && elemento.title.length > 0 ? elemento.title : 'Sem título',
      ...(elemento.artist ? { artista: elemento.artist } : {}),
    });
  }
  return itens;
}

interface GatilhoBruto {
  id?: string | number;
  enabled?: boolean;
  when?: string;
  type?: string;
  receiver?: { type?: string } | null;
  description?: string;
}

/** Resposta de GetTriggers → lista em português; o que não tem `when`/`type` não serve para nada. */
export function normalizarGatilhos(bruta: unknown): GatilhoHolyrics[] {
  if (!Array.isArray(bruta)) return [];
  const gatilhos: GatilhoHolyrics[] = [];
  for (const elemento of bruta as GatilhoBruto[]) {
    if (elemento === null || typeof elemento !== 'object') continue;
    if (!elemento.when || !elemento.type) continue;
    gatilhos.push({
      id: elemento.id === undefined || elemento.id === null ? '' : String(elemento.id),
      // A doc mostra `enabled` sempre presente; ausente, vale como ligado.
      ativo: elemento.enabled !== false,
      quando: elemento.when,
      tipo: elemento.type,
      receptor: elemento.receiver?.type ?? null,
      descricao: elemento.description ?? '',
    });
  }
  return gatilhos;
}

type RelogioBruto = Record<string, unknown> & { enabled?: boolean; position?: string; height?: number };

interface PapelDeParedeBruto {
  show_clock?: boolean;
  by_screen?: Record<string, { clock?: RelogioBruto | null } | null>;
}

/** O papel de parede pode ter configuração própria por tela; a do telão (`public`) vale mais que a padrão. */
function relogioEmUso(bruta: PapelDeParedeBruto | undefined): RelogioBruto | null {
  const telas = bruta?.by_screen;
  return telas?.public?.clock ?? telas?.default?.clock ?? null;
}

export function normalizarRelogio(bruta: unknown): EstadoRelogio {
  const papel = (bruta ?? {}) as PapelDeParedeBruto;
  const relogio = relogioEmUso(papel);
  const posicao = POSICOES_RELOGIO.find((p) => p === relogio?.position) ?? null;
  return {
    // Holyrics antigo (antes da 2.23) só tem o `show_clock` geral.
    mostrar: relogio?.enabled ?? papel.show_clock ?? false,
    posicao,
    tamanho: typeof relogio?.height === 'number' ? relogio.height : null,
  };
}

/**
 * Corpo do SetWallpaperSettings: o relógio inteiro de cada tela que tem
 * configuração própria, com a mudança por cima. Mandar só o campo mudado
 * arriscaria o Holyrics zerar cor e fonte.
 */
export function montarMudancaRelogio(bruta: unknown, mudanca: MudancaRelogio): Record<string, unknown> {
  const papel = (bruta ?? {}) as PapelDeParedeBruto;
  const porTela: Record<string, { clock: RelogioBruto }> = {};
  const aplicar = (atual: RelogioBruto | null | undefined): RelogioBruto => ({
    ...(atual ?? {}),
    ...(mudanca.mostrar !== undefined ? { enabled: mudanca.mostrar } : {}),
    ...(mudanca.posicao !== undefined ? { position: mudanca.posicao satisfies PosicaoRelogio } : {}),
    ...(mudanca.tamanho !== undefined ? { height: mudanca.tamanho } : {}),
  });
  for (const [tela, config] of Object.entries(papel.by_screen ?? {})) {
    if (config) porTela[tela] = { clock: aplicar(config.clock) };
  }
  if (!porTela.default) porTela.default = { clock: aplicar(null) };
  return {
    ...(mudanca.mostrar !== undefined ? { show_clock: mudanca.mostrar } : {}),
    by_screen: porTela,
  };
}

function rotularSemNome(tipo: string | undefined): string {
  switch (tipo) {
    case 'verse':
      return 'Texto bíblico';
    case 'text':
      return 'Texto';
    case 'announcement':
      return 'Aviso';
    case 'quick_presentation':
      return 'Apresentação rápida';
    case 'image':
      return 'Imagem';
    default:
      return 'Sem título';
  }
}

export function criarDriverHolyrics(): DriverHolyrics {
  return {
    async ler(dispositivo, op): Promise<EstadoHolyrics> {
      try {
        const bruta = await chamar<unknown>(dispositivo, 'GetCurrentPresentation', {}, op);
        return { online: true, erro: null, apresentacao: normalizarApresentacao(bruta) };
      } catch (err) {
        return {
          online: false,
          erro: err instanceof ErroDriver ? err.message : String(err),
          apresentacao: null,
        };
      }
    },

    async proximo(dispositivo, op) {
      await chamar(dispositivo, 'ActionNext', {}, op);
    },

    async anterior(dispositivo, op) {
      await chamar(dispositivo, 'ActionPrevious', {}, op);
    },

    async irPara(dispositivo, indice, op) {
      await chamar(dispositivo, 'ActionGoToIndex', { index: indice }, op);
    },

    async encerrarApresentacao(dispositivo, op) {
      await chamar(dispositivo, 'CloseCurrentPresentation', {}, op);
    },

    async listarPlaylist(dispositivo, op) {
      const bruta = await chamar<unknown>(dispositivo, 'GetLyricsPlaylist', {}, op);
      return normalizarPlaylist(bruta);
    },

    async mostrarLetra(dispositivo, letraId, op) {
      await chamar(dispositivo, 'ShowLyrics', { id: letraId }, op);
    },

    async mostrarVersiculo(dispositivo, referencia, op) {
      // Sem `quick_presentation`: como apresentação normal, ela dispara o
      // gatilho "ao exibir texto bíblico", que é o que o teste quer provar.
      await chamar(dispositivo, 'ShowVerse', { references: referencia }, op);
    },

    async listarGatilhos(dispositivo, op) {
      const bruta = await chamar<unknown>(dispositivo, 'GetTriggers', {}, op);
      return normalizarGatilhos(bruta);
    },

    async definirF(dispositivo, tecla, ativar, op) {
      await chamar(dispositivo, `SetF${tecla}`, { enable: ativar }, op);
    },

    async paginaVisualizacao(dispositivo, op) {
      const cfg = dispositivo.servicos.holyrics;
      if (!cfg || !dispositivo.host) return null;
      // A página mora no mesmo servidor do Holyrics que serve as legendas; em
      // algumas instalações é a porta do API Server, em outras é outra porta.
      const origens = new Set<string>();
      if (cfg.legendaUrl) {
        try {
          origens.add(new URL(cfg.legendaUrl).origin);
        } catch {
          // URL de legenda inválida: segue só com a porta da API
        }
      }
      origens.add(`http://${dispositivo.host}:${cfg.porta}`);
      for (const origem of origens) {
        const url = `${origem}/view/widescreen`;
        try {
          const resposta = await fetch(url, {
            method: 'GET',
            signal: op?.sinal ?? AbortSignal.timeout(op?.timeoutMs ?? TIMEOUT_PADRAO_MS),
          });
          if (resposta.ok) return url;
        } catch {
          // tenta a próxima porta
        }
      }
      return null;
    },

    async lerRelogio(dispositivo, op) {
      // A resposta traz a imagem do papel de parede em base64: pode ser grande.
      const bruta = await chamar<unknown>(dispositivo, 'GetWallpaperSettings', {}, { timeoutMs: 5000, ...(op ?? {}) });
      return normalizarRelogio(bruta);
    },

    async definirRelogio(dispositivo, mudanca, op) {
      const opcoes = { timeoutMs: 5000, ...(op ?? {}) };
      const atual = await chamar<unknown>(dispositivo, 'GetWallpaperSettings', {}, opcoes);
      const resposta = await chamar<unknown>(dispositivo, 'SetWallpaperSettings', montarMudancaRelogio(atual, mudanca), opcoes);
      // Sucesso é `true`; senão vem a lista do que deu errado.
      if (Array.isArray(resposta) && resposta.length > 0) {
        throw new ErroDriver(`O Holyrics do ${dispositivo.nome} não aceitou mudar o relógio: ${resposta.join('; ')}`);
      }
      return normalizarRelogio(await chamar<unknown>(dispositivo, 'GetWallpaperSettings', {}, opcoes));
    },

    async apresentacaoRapida(dispositivo, texto, op) {
      await chamar(dispositivo, 'ShowQuickPresentation', { text: texto }, op);
    },

    async checarPaginaLegenda(dispositivo, op) {
      const url = dispositivo.servicos.holyrics?.legendaUrl;
      if (!url) {
        throw new ErroDriver(
          `A URL de legenda do ${dispositivo.nome} não está configurada. Copie do Holyrics a mesma URL usada na fonte de navegador do OBS.`,
        );
      }
      try {
        const resposta = await fetch(url, {
          method: 'GET',
          signal: op?.sinal ?? AbortSignal.timeout(op?.timeoutMs ?? TIMEOUT_PADRAO_MS),
        });
        return { status: resposta.status, url };
      } catch (err) {
        throw new ErroDriver(
          `A página de legendas não respondeu (${url}). Verifique se o servidor web do Holyrics está ativo no ${dispositivo.nome}.`,
          err instanceof Error ? err.message : String(err),
        );
      }
    },
  };
}
