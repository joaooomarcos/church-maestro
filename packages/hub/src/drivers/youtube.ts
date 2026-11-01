import { ErroDriver, type DriverYoutube } from './tipos.js';

const TIMEOUT_MS = 8000;

/**
 * Pergunta à API de dados do YouTube se o canal tem uma transmissão ao vivo
 * pública agora. A chave vai só no cabeçalho: URL aparece em log, em mensagem
 * de erro e em qualquer print da tela. A `base` existe para o teste apontar
 * para um servidor local.
 */
export function criarDriverYoutube(base = 'https://www.googleapis.com'): DriverYoutube {
  return {
    async aoVivo({ canalId, chaveApi }) {
      const url =
        `${base}/youtube/v3/search?part=id&channelId=${encodeURIComponent(canalId)}` +
        '&eventType=live&type=video&maxResults=1';
      let resposta: Response;
      try {
        resposta = await fetch(url, {
          headers: { 'X-goog-api-key': chaveApi, Accept: 'application/json' },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (erro) {
        const expirou = erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError');
        throw new ErroDriver(
          expirou ? 'O YouTube demorou demais para responder.' : 'Não consegui falar com o YouTube. Confira a internet do PC Transmissão.',
          expirou ? 'timeout' : 'falha de rede',
        );
      }

      if (resposta.status === 400 || resposta.status === 403) {
        throw new ErroDriver(
          'O YouTube recusou a chave de API. Confira se ela está certa, se a "YouTube Data API v3" está ativada e se a cota do dia não acabou.',
          `HTTP ${resposta.status}`,
        );
      }
      if (!resposta.ok) {
        throw new ErroDriver('O YouTube respondeu com erro. Tente de novo em instantes.', `HTTP ${resposta.status}`);
      }

      let corpo: unknown;
      try {
        corpo = await resposta.json();
      } catch {
        throw new ErroDriver('O YouTube respondeu algo que não entendi.', 'JSON inválido');
      }
      const itens = (corpo as { items?: unknown } | null)?.items;
      if (!Array.isArray(itens)) {
        throw new ErroDriver('O YouTube respondeu algo que não entendi.', 'campo items ausente');
      }
      return itens.length > 0;
    },
  };
}
