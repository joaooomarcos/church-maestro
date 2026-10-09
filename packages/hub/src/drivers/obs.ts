import OBSWebSocket from 'obs-websocket-js';
import { ErroDriver, type DriverObs } from './tipos.js';
import type { DispositivoConfig, EstadoObs, ItemEstruturaObs } from '@maestro/shared';

/**
 * obs-websocket v5 (Ferramentas › Configurações do WebSocket no OBS).
 *
 * A conexão é mantida aberta e reaproveitada entre as leituras do poller —
 * reconectar a cada 2 segundos seria caro e enche o log do OBS. Se a conexão
 * cair (o operador fechou o OBS), a próxima chamada reconecta sozinha.
 */

const TIMEOUT_CONEXAO_MS = 2000;
/** Espera mínima entre tentativas, para não martelar um OBS que está fechado. */
const INTERVALO_RETENTATIVA_MS = 5000;

interface Conexao {
  obs: OBSWebSocket;
  conectado: boolean;
  conectando: Promise<void> | null;
  proximaTentativaEm: number;
  /** Amostra anterior de bytes enviados, para calcular o bitrate. */
  amostraBytes: { bytes: number; ts: number } | null;
}

export function criarDriverObs(): DriverObs {
  const conexoes = new Map<string, Conexao>();

  function obterConexao(dispositivo: DispositivoConfig): Conexao {
    let conexao = conexoes.get(dispositivo.id);
    if (!conexao) {
      const obs = new OBSWebSocket();
      conexao = { obs, conectado: false, conectando: null, proximaTentativaEm: 0, amostraBytes: null };
      obs.on('ConnectionClosed', () => {
        const atual = conexoes.get(dispositivo.id);
        if (atual) {
          atual.conectado = false;
          atual.amostraBytes = null;
        }
      });
      // Sem este handler, um erro de socket vira exceção não tratada no processo.
      obs.on('ConnectionError', () => {
        const atual = conexoes.get(dispositivo.id);
        if (atual) atual.conectado = false;
      });
      conexoes.set(dispositivo.id, conexao);
    }
    return conexao;
  }

  async function garantirConexao(dispositivo: DispositivoConfig): Promise<Conexao> {
    const cfg = dispositivo.servicos.obs;
    if (!cfg) {
      throw new ErroDriver(`O dispositivo "${dispositivo.nome}" não tem o OBS configurado.`);
    }
    if (!dispositivo.host) {
      throw new ErroDriver(`O dispositivo "${dispositivo.nome}" está sem endereço de rede.`);
    }

    const conexao = obterConexao(dispositivo);
    if (conexao.conectado) return conexao;

    if (conexao.conectando) {
      await conexao.conectando;
      return conexao;
    }

    if (Date.now() < conexao.proximaTentativaEm) {
      throw new ErroDriver(
        `O OBS do ${dispositivo.nome} não está respondendo. Verifique se ele está aberto e com o WebSocket ativado.`,
      );
    }

    const url = `ws://${dispositivo.host}:${cfg.porta}`;
    conexao.conectando = (async () => {
      try {
        await Promise.race([
          conexao.obs.connect(url, cfg.senha),
          new Promise<never>((_, rejeitar) =>
            setTimeout(() => rejeitar(new Error('timeout')), TIMEOUT_CONEXAO_MS),
          ),
        ]);
        conexao.conectado = true;
      } catch (err) {
        conexao.conectado = false;
        conexao.proximaTentativaEm = Date.now() + INTERVALO_RETENTATIVA_MS;
        const causa = err instanceof Error ? err.message : String(err);
        throw new ErroDriver(
          causa.toLowerCase().includes('auth')
            ? `A senha do WebSocket do OBS no ${dispositivo.nome} está incorreta.`
            : `Não foi possível conectar ao OBS do ${dispositivo.nome}. Verifique se ele está aberto e com o WebSocket ativado.`,
          causa,
        );
      } finally {
        conexao.conectando = null;
      }
    })();

    await conexao.conectando;
    return conexao;
  }

  /**
   * O OBS não informa bitrate diretamente; ele vem da variação de bytes
   * enviados entre duas leituras. A primeira leitura depois de conectar
   * devolve zero, porque ainda não há com o que comparar.
   */
  function calcularBitrateKbps(conexao: Conexao, bytes: number): number {
    const agora = Date.now();
    const anterior = conexao.amostraBytes;
    conexao.amostraBytes = { bytes, ts: agora };
    if (!anterior || agora <= anterior.ts) return 0;
    const deltaBytes = bytes - anterior.bytes;
    if (deltaBytes <= 0) return 0;
    const deltaSegundos = (agora - anterior.ts) / 1000;
    return Math.round((deltaBytes * 8) / deltaSegundos / 1000);
  }

  async function idDoItem(
    conexao: Conexao,
    cena: string,
    source: string,
  ): Promise<number | null> {
    try {
      const { sceneItemId } = await conexao.obs.call('GetSceneItemId', {
        sceneName: cena,
        sourceName: source,
      });
      return sceneItemId;
    } catch {
      // A source pode simplesmente não estar nesta cena.
      return null;
    }
  }

  function causa(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  function itensDe(sceneItems: unknown[]): ItemEstruturaObs[] {
    return sceneItems
      .map((bruto) => {
        const item = bruto as { sourceName?: unknown; inputKind?: unknown; isGroup?: unknown };
        if (typeof item.sourceName !== 'string') return null;
        return {
          nome: item.sourceName,
          tipo: typeof item.inputKind === 'string' ? item.inputKind : null,
          grupo: item.isGroup === true,
        };
      })
      .filter((i): i is ItemEstruturaObs => i !== null);
  }

  /** Id do item na cena (ou grupo), com erro já explicado quando ele não está lá. */
  async function idObrigatorio(
    dispositivo: DispositivoConfig,
    conexao: Conexao,
    cena: string,
    item: string,
  ): Promise<number> {
    const id = await idDoItem(conexao, cena, item);
    if (id === null) {
      throw new ErroDriver(
        `No OBS do ${dispositivo.nome}, "${item}" não está dentro de "${cena}". Confira os nomes em Ajustes › Legendas.`,
      );
    }
    return id;
  }

  return {
    async ler(dispositivo): Promise<EstadoObs> {
      const vazio: EstadoObs = {
        online: false,
        erro: null,
        cenaAtual: null,
        cenas: [],
        transmitindo: false,
        gravando: false,
        tempoTransmissaoS: 0,
        bitrateKbps: 0,
        framesPerdidos: 0,
        percFramesPerdidos: 0,
      };

      try {
        const conexao = await garantirConexao(dispositivo);
        const [cenas, transmissao, gravacao] = await Promise.all([
          conexao.obs.call('GetSceneList'),
          conexao.obs.call('GetStreamStatus'),
          conexao.obs.call('GetRecordStatus'),
        ]);

        const totalFrames = transmissao.outputTotalFrames ?? 0;
        const perdidos = transmissao.outputSkippedFrames ?? 0;

        return {
          online: true,
          erro: null,
          cenaAtual: cenas.currentProgramSceneName ?? null,
          cenas: cenas.scenes
            .map((c) => (c as { sceneName?: string }).sceneName)
            .filter((n): n is string => typeof n === 'string'),
          transmitindo: transmissao.outputActive,
          gravando: gravacao.outputActive,
          tempoTransmissaoS: Math.round((transmissao.outputDuration ?? 0) / 1000),
          bitrateKbps: transmissao.outputActive
            ? calcularBitrateKbps(conexao, transmissao.outputBytes ?? 0)
            : 0,
          framesPerdidos: perdidos,
          percFramesPerdidos: totalFrames > 0 ? Number(((perdidos / totalFrames) * 100).toFixed(2)) : 0,
        };
      } catch (err) {
        return { ...vazio, erro: err instanceof ErroDriver ? err.message : String(err) };
      }
    },

    async definirCena(dispositivo, cena) {
      const conexao = await garantirConexao(dispositivo);
      try {
        await conexao.obs.call('SetCurrentProgramScene', { sceneName: cena });
      } catch (err) {
        throw new ErroDriver(
          `Não foi possível mudar para a cena "${cena}" no OBS do ${dispositivo.nome}. Confira se o nome da cena está correto.`,
          err instanceof Error ? err.message : String(err),
        );
      }
    },

    async sourceVisivel(dispositivo, source) {
      const conexao = await garantirConexao(dispositivo);
      const { currentProgramSceneName } = await conexao.obs.call('GetSceneList');
      const itemId = await idDoItem(conexao, currentProgramSceneName, source);
      if (itemId === null) return false;
      const { sceneItemEnabled } = await conexao.obs.call('GetSceneItemEnabled', {
        sceneName: currentProgramSceneName,
        sceneItemId: itemId,
      });
      return sceneItemEnabled;
    },

    async capturarSource(dispositivo, source) {
      const conexao = await garantirConexao(dispositivo);
      try {
        const { imageData } = await conexao.obs.call('GetSourceScreenshot', {
          sourceName: source,
          imageFormat: 'png',
          // Resolução baixa de propósito: a captura só serve para comparar
          // antes/depois, e imagem menor deixa a diferença mais estável.
          imageWidth: 480,
          imageHeight: 270,
        });
        return imageData;
      } catch (err) {
        throw new ErroDriver(
          `Não foi possível capturar a fonte "${source}" no OBS do ${dispositivo.nome}. Confira se esse é o nome exato da fonte de legenda.`,
          err instanceof Error ? err.message : String(err),
        );
      }
    },

    async estrutura(dispositivo) {
      const conexao = await garantirConexao(dispositivo);
      try {
        const [{ scenes }, { groups }] = await Promise.all([
          conexao.obs.call('GetSceneList'),
          conexao.obs.call('GetGroupList'),
        ]);
        const nomesCenas = scenes
          .map((c) => (c as { sceneName?: unknown }).sceneName)
          .filter((n): n is string => typeof n === 'string')
          // O OBS devolve as cenas de baixo para cima; a tela mostra como na lista do OBS.
          .reverse();
        const cenas = await Promise.all(
          nomesCenas.map(async (nome) => {
            const { sceneItems } = await conexao.obs.call('GetSceneItemList', { sceneName: nome });
            return { nome, itens: itensDe(sceneItems) };
          }),
        );
        const grupos = await Promise.all(
          groups.map(async (nome) => {
            const { sceneItems } = await conexao.obs.call('GetGroupSceneItemList', { sceneName: nome });
            return { nome, itens: itensDe(sceneItems) };
          }),
        );
        return { cenas, grupos };
      } catch (err) {
        throw new ErroDriver(`Não foi possível ler as cenas do OBS do ${dispositivo.nome}.`, causa(err));
      }
    },

    async itemVisivel(dispositivo, cena, item) {
      const conexao = await garantirConexao(dispositivo);
      const id = await idObrigatorio(dispositivo, conexao, cena, item);
      try {
        const { sceneItemEnabled } = await conexao.obs.call('GetSceneItemEnabled', {
          sceneName: cena,
          sceneItemId: id,
        });
        return sceneItemEnabled;
      } catch (err) {
        throw new ErroDriver(`Não foi possível ler o olhinho de "${item}" no OBS do ${dispositivo.nome}.`, causa(err));
      }
    },

    async definirItemVisivel(dispositivo, cena, item, visivel) {
      const conexao = await garantirConexao(dispositivo);
      const id = await idObrigatorio(dispositivo, conexao, cena, item);
      try {
        await conexao.obs.call('SetSceneItemEnabled', {
          sceneName: cena,
          sceneItemId: id,
          sceneItemEnabled: visivel,
        });
      } catch (err) {
        throw new ErroDriver(`Não foi possível mudar o olhinho de "${item}" no OBS do ${dispositivo.nome}.`, causa(err));
      }
    },

    async urlDaFonte(dispositivo, fonte) {
      const conexao = await garantirConexao(dispositivo);
      try {
        const { inputSettings, inputKind } = await conexao.obs.call('GetInputSettings', { inputName: fonte });
        if (inputKind !== 'browser_source') return null;
        if (inputSettings.is_local_file === true) return null;
        // `url` só aparece nas configurações quando foi mudada do padrão.
        return typeof inputSettings.url === 'string' ? inputSettings.url : null;
      } catch (err) {
        throw new ErroDriver(
          `A fonte "${fonte}" não existe no OBS do ${dispositivo.nome}. Confira o nome em Ajustes › Legendas.`,
          causa(err),
        );
      }
    },

    async atualizarFonte(dispositivo, fonte) {
      const conexao = await garantirConexao(dispositivo);
      try {
        // "refreshnocache" é o botão "Atualizar" das propriedades da fonte de navegador.
        await conexao.obs.call('PressInputPropertiesButton', {
          inputName: fonte,
          propertyName: 'refreshnocache',
        });
      } catch (err) {
        throw new ErroDriver(
          `Não foi possível atualizar a fonte "${fonte}" no OBS do ${dispositivo.nome}. Confira se ela é uma fonte de navegador com esse nome exato.`,
          causa(err),
        );
      }
    },

    async encerrar() {
      await Promise.allSettled(
        [...conexoes.values()].map(async (c) => {
          if (c.conectado) await c.obs.disconnect();
        }),
      );
      conexoes.clear();
    },
  };
}
