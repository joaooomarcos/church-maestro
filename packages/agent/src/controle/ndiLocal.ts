import { FONTE_NDI_NENHUMA, extrairFonteAtual, extrairFontes } from '@maestro/shared';

/**
 * O Studio Monitor desta máquina, falado direto em localhost (o mesmo web
 * control que o hub usa pela rede). Assim a troca de NDI pela tela de controle
 * funciona mesmo com o hub fora do ar.
 */

const TIMEOUT_MS = 1200;

export interface JanelaNdiLocal {
  porta: number;
  online: boolean;
  fonteAtual: string | null;
  fontes: string[];
}

async function pedir(porta: number, caminho: string, init: RequestInit = {}): Promise<unknown> {
  const resposta = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status} em ${caminho}`);
  return resposta.json().catch(() => null);
}

export async function lerJanelaNdi(porta: number): Promise<JanelaNdiLocal> {
  try {
    const [configuracao, fontes] = await Promise.all([
      pedir(porta, '/v1/configuration'),
      pedir(porta, '/v1/sources').then(extrairFontes),
    ]);
    return { porta, online: true, fonteAtual: extrairFonteAtual(configuracao), fontes };
  } catch {
    return { porta, online: false, fonteAtual: null, fontes: [] };
  }
}

/** `fonte: null` deixa a janela sem imagem. */
export async function trocarFonteNdi(porta: number, fonte: string | null): Promise<void> {
  try {
    await pedir(porta, '/v1/configuration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: 1, NDI_source: fonte ?? FONTE_NDI_NENHUMA }),
    });
  } catch (err) {
    const causa = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Não consegui trocar a fonte da janela ${porta}. Confira se o Studio Monitor está aberto e com "Allow Web Control" marcado. (${causa})`,
    );
  }
}
