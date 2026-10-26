import { ErroDriver, type DriverNdi, type OpcoesRequisicao } from './tipos.js';
import {
  FONTE_NDI_NENHUMA,
  extrairFonteAtual,
  extrairFontes,
  type EstadoNdiMonitor,
} from '@maestro/shared';

// Os leitores das respostas moram no shared (o agente também usa); os testes os importam daqui.
export { extrairFonteAtual, extrairFontes };

/**
 * NDI Studio Monitor expõe um web control simples quando "Allow Web Control"
 * está marcado nas configurações. Cada janela aberta ocupa uma porta: a
 * primeira na 80, a segunda na 81, e assim por diante.
 *
 *   GET  /v1/sources        → fontes NDI, displays e saídas de áudio visíveis
 *   GET  /v1/configuration  → configuração atual, inclusive a fonte selecionada
 *   POST /v1/configuration  → {"version":1,"NDI_source":"NOME"} troca a fonte
 *
 * O formato exato de /v1/sources não é documentado pela NDI e já mudou entre
 * versões do NDI Tools, então o parser aceita várias formas em vez de assumir
 * uma. Se a resposta vier num formato novo, preferimos devolver lista vazia a
 * derrubar o painel inteiro.
 */

const TIMEOUT_PADRAO_MS = 1500;

async function requisitar(
  url: string,
  init: RequestInit,
  op: OpcoesRequisicao | undefined,
  oQueFazia: string,
): Promise<Response> {
  const timeoutMs = op?.timeoutMs ?? TIMEOUT_PADRAO_MS;
  try {
    const resposta = await fetch(url, {
      ...init,
      signal: op?.sinal ?? AbortSignal.timeout(timeoutMs),
    });
    if (!resposta.ok) {
      throw new ErroDriver(
        `O NDI Studio Monitor respondeu com erro ao ${oQueFazia}.`,
        `HTTP ${resposta.status} em ${url}`,
      );
    }
    return resposta;
  } catch (err) {
    if (err instanceof ErroDriver) throw err;
    const causa = err instanceof Error ? err.message : String(err);
    if (causa.includes('timed out') || causa.includes('abort')) {
      throw new ErroDriver(
        'O NDI Studio Monitor não respondeu a tempo. A máquina pode estar desligada.',
        causa,
      );
    }
    throw new ErroDriver(
      'Não foi possível falar com o NDI Studio Monitor. Verifique se ele está aberto e se "Allow Web Control" está marcado.',
      causa,
    );
  }
}

export function criarDriverNdi(): DriverNdi {
  const base = (host: string, porta: number): string => `http://${host}:${porta}`;

  const listarFontes: DriverNdi['listarFontes'] = async (host, porta, op) => {
    const resposta = await requisitar(
      `${base(host, porta)}/v1/sources`,
      { method: 'GET' },
      op,
      'listar as fontes',
    );
    return extrairFontes(await resposta.json().catch(() => null));
  };

  return {
    listarFontes,

    async ler(host, porta, op): Promise<EstadoNdiMonitor> {
      try {
        const [configuracao, fontes] = await Promise.all([
          requisitar(
            `${base(host, porta)}/v1/configuration`,
            { method: 'GET' },
            op,
            'ler a configuração',
          ).then((r) => r.json().catch(() => null)),
          listarFontes(host, porta, op),
        ]);

        return {
          online: true,
          erro: null,
          porta,
          fonteAtual: extrairFonteAtual(configuracao),
          fontesDisponiveis: fontes,
        };
      } catch (err) {
        return {
          online: false,
          erro: err instanceof ErroDriver ? err.message : String(err),
          porta,
          fonteAtual: null,
          fontesDisponiveis: [],
        };
      }
    },

    async definirFonte(host, porta, fonte, op) {
      await requisitar(
        `${base(host, porta)}/v1/configuration`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 1, NDI_source: fonte ?? FONTE_NDI_NENHUMA }),
        },
        op,
        'trocar a fonte',
      );
    },
  };
}
