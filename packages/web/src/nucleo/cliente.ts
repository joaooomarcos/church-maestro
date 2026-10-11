import { ROTAS, type ErroApi } from '@maestro/shared';

/**
 * Erro já com a mensagem em português pronta para a tela — extraída do corpo
 * `{erro, mensagem, detalhe}` que a API devolve, ou uma mensagem genérica
 * quando nem isso foi possível obter (rede fora do ar, por exemplo).
 */
export class ErroRequisicao extends Error {
  detalhe: string | undefined;
  /** Status HTTP da resposta; ausente quando nem houve resposta (rede fora, tempo esgotado). */
  status: number | undefined;

  constructor(mensagem: string, detalhe?: string, status?: number) {
    super(mensagem);
    this.detalhe = detalhe;
    this.status = status;
  }
}

type OuvinteNaoAutenticado = () => void;
type OuvinteErro = (mensagem: string) => void;

let ouvinteNaoAutenticado: OuvinteNaoAutenticado | null = null;
let ouvintesErro: OuvinteErro[] = [];

/** A sessão expirou (401 em qualquer chamada) — a tela de PIN deve reaparecer. */
export function definirOuvinteNaoAutenticado(fn: OuvinteNaoAutenticado | null): void {
  ouvinteNaoAutenticado = fn;
}

/** Toda falha de requisição (exceto 401, que tem tratamento próprio) vira um toast. */
export function ouvirErros(fn: OuvinteErro): () => void {
  ouvintesErro = [...ouvintesErro, fn];
  return () => {
    ouvintesErro = ouvintesErro.filter((atual) => atual !== fn);
  };
}

function notificarErro(mensagem: string): void {
  for (const fn of ouvintesErro) fn(mensagem);
}

const ROTAS_DE_ENTRADA = new Set<string>([ROTAS.login, ROTAS.convidadoEntrar]);

/**
 * Tempo limite dos comandos de controle (passar slide etc.). Celular que acabou
 * de desbloquear ou trocou de wi-fi deixa o pedido pendurado sem erro nenhum, e
 * o botão ficaria cinza esperando; melhor desistir logo e deixar tocar de novo.
 */
export const TEMPO_LIMITE_COMANDO_MS = 6000;

async function requisitar<T>(caminho: string, opcoes?: RequestInit, tempoLimiteMs?: number): Promise<T> {
  let resposta: Response;
  const controle = tempoLimiteMs ? new AbortController() : null;
  const relogio = controle ? setTimeout(() => controle.abort(), tempoLimiteMs) : null;
  try {
    resposta = await fetch(caminho, {
      credentials: 'include',
      headers: opcoes?.body ? { 'Content-Type': 'application/json' } : undefined,
      signal: controle?.signal,
      ...opcoes,
    });
  } catch {
    const mensagem = controle?.signal.aborted
      ? 'O servidor demorou para responder. Confira o wi-fi e toque de novo.'
      : 'Não foi possível falar com o servidor. Verifique a conexão.';
    notificarErro(mensagem);
    throw new ErroRequisicao(mensagem);
  } finally {
    if (relogio) clearTimeout(relogio);
  }

  // Nas rotas de entrada (PIN da equipe e PIN do convidado) o 401 é "PIN incorreto." —
  // a mensagem certa vem do servidor; a "sessão expirada" só faz sentido nas demais chamadas.
  if (resposta.status === 401 && !ROTAS_DE_ENTRADA.has(caminho)) {
    ouvinteNaoAutenticado?.();
    throw new ErroRequisicao('Sessão expirada. Entre novamente.', undefined, 401);
  }

  if (!resposta.ok) {
    let corpo: Partial<ErroApi> = {};
    try {
      corpo = (await resposta.json()) as ErroApi;
    } catch {
      // resposta sem corpo JSON — segue com a mensagem genérica abaixo.
    }
    const mensagem = corpo.mensagem ?? 'Ocorreu um erro inesperado.';
    notificarErro(mensagem);
    throw new ErroRequisicao(mensagem, corpo.detalhe, resposta.status);
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export function apiGet<T>(caminho: string, tempoLimiteMs?: number): Promise<T> {
  return requisitar<T>(caminho, undefined, tempoLimiteMs);
}

export function apiPost<T>(caminho: string, corpo?: unknown, tempoLimiteMs?: number): Promise<T> {
  return requisitar<T>(
    caminho,
    {
      method: 'POST',
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    },
    tempoLimiteMs,
  );
}

export function apiPut<T>(caminho: string, corpo: unknown): Promise<T> {
  return requisitar<T>(caminho, { method: 'PUT', body: JSON.stringify(corpo) });
}

export function apiDelete<T>(caminho: string): Promise<T> {
  return requisitar<T>(caminho, { method: 'DELETE' });
}
