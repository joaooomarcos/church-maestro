import type { DispositivoConfig, ResultadoCheck } from '@maestro/shared';
import type { Drivers } from '../drivers/tipos.js';

/** O que um check precisa do hub para rodar. */
export interface ContextoCheck {
  drivers: Drivers;
  dispositivos(): DispositivoConfig[];
  /** Publica o resultado no WebSocket, para todas as telas verem ao vivo. */
  publicar?(resultado: ResultadoCheck): void;
}

export interface OpcoesCheckLegendas {
  /** id do dispositivo com o Holyrics que gera a legenda. */
  dispositivoHolyrics?: string;
  /** id do dispositivo com o OBS que exibe a legenda. */
  dispositivoObs?: string;
  /**
   * Quando true, exibe um texto marcador no Holyrics e confere se ele apareceu
   * de fato no OBS. É a única etapa que mexe no que está no ar, então é
   * recusada se já houver apresentação sendo exibida.
   */
  provaReal?: boolean;
  /**
   * Tempo entre exibir o marcador e capturar a imagem. Fontes de navegador
   * pesadas demoram mais para renderizar; o padrão serve para a maioria.
   */
  esperaRenderizacaoMs?: number;
  /** Intervalo entre as duas capturas de referência. */
  esperaReferenciaMs?: number;
}
