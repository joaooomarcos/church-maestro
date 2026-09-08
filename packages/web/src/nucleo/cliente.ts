import type { ErroApi } from '@maestro/shared';

/**
 * Erro já com a mensagem em português pronta para a tela — extraída do corpo
 * `{erro, mensagem, detalhe}` que a API devolve, ou uma mensagem genérica
 * quando nem isso foi possível obter (rede fora do ar, por exemplo).
 */
export class ErroRequisicao extends Error {
  detalhe: string | undefined;

  constructor(mensagem: string, detalhe?: string) {
    super(mensagem);
    this.detalhe = detalhe;
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

async function requisitar<T>(caminho: string, opcoes?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(caminho, {
      credentials: 'include',
      headers: opcoes?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opcoes,
    });
  } catch {
    const mensagem = 'Não foi possível falar com o servidor. Verifique a conexão.';
    notificarErro(mensagem);
    throw new ErroRequisicao(mensagem);
  }

  if (resposta.status === 401) {
    ouvinteNaoAutenticado?.();
    throw new ErroRequisicao('Sessão expirada. Entre novamente.');
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
    throw new ErroRequisicao(mensagem, corpo.detalhe);
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}

export function apiGet<T>(caminho: string): Promise<T> {
  return requisitar<T>(caminho);
}

export function apiPost<T>(caminho: string, corpo?: unknown): Promise<T> {
  return requisitar<T>(caminho, {
    method: 'POST',
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
}
