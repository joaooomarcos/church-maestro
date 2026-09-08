import { ErroDriver, type DriverHolyrics, type OpcoesRequisicao } from './tipos.js';
import type { DispositivoConfig, EstadoHolyrics, ApresentacaoHolyrics } from '@maestro/shared';

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

    async definirF(dispositivo, tecla, ativar, op) {
      await chamar(dispositivo, `SetF${tecla}`, { enable: ativar }, op);
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
