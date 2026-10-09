import type { DispositivoConfig, ResultadoCheck } from '@maestro/shared';
import type { Drivers } from '../drivers/tipos.js';

/** O que um check precisa do hub para rodar. */
export interface ContextoCheck {
  drivers: Drivers;
  dispositivos(): DispositivoConfig[];
  /** Hostname que o agente informou no último heartbeat (para casar com o nome da fonte NDI). */
  hostname?(dispositivoId: string): string | undefined;
  /** Publica o resultado no WebSocket, para todas as telas verem ao vivo. */
  publicar?(resultado: ResultadoCheck): void;
}

export interface OpcoesCheckLegendas {
  /**
   * "Forçar teste": passa por cima do horário proibido e do OBS transmitindo
   * ou gravando. Nunca passa por cima de Holyrics com apresentação no ar.
   */
  forcar?: boolean;
  /** Testa só estes Holyrics (ids). Ausente = todos os marcados como usados. */
  holyrics?: string[];
  /** Tempo entre exibir no Holyrics e capturar a fonte no OBS. */
  esperaRenderizacaoMs?: number;
  /** Intervalo entre as duas capturas de referência. */
  esperaReferenciaMs?: number;
  /** Quanto esperar o gatilho do Holyrics abrir ou fechar o grupo no OBS. */
  esperaGrupoMs?: number;
  /** De quanto em quanto tempo olhar o grupo enquanto espera. */
  intervaloGrupoMs?: number;
  /** Relógio, para os testes. */
  agora?: () => Date;
}
