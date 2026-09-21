import type {
  DispositivoConfig,
  EstadoHolyrics,
  EstadoNdiMonitor,
  EstadoObs,
  EstadoAgente,
  EstadoPowerPoint,
  StatusPpt,
} from '@maestro/shared';

/**
 * Erro de integração. Carrega uma mensagem já em português porque ela sobe
 * inteira até a tela do celular de quem está operando.
 */
export class ErroDriver extends Error {
  constructor(
    override readonly message: string,
    readonly causaTecnica?: string,
  ) {
    super(message);
    this.name = 'ErroDriver';
  }
}

/** Opções comuns a toda chamada de rede local: curtas, porque é LAN. */
export interface OpcoesRequisicao {
  timeoutMs?: number;
  sinal?: AbortSignal;
}

export interface DriverNdi {
  /** Lista as fontes NDI que aquela janela do Studio Monitor enxerga. */
  listarFontes(host: string, porta: number, op?: OpcoesRequisicao): Promise<string[]>;
  /** Lê o estado completo de uma janela: fonte atual + fontes disponíveis. */
  ler(host: string, porta: number, op?: OpcoesRequisicao): Promise<EstadoNdiMonitor>;
  /** `fonte: null` seleciona "None" (janela sem imagem). */
  definirFonte(
    host: string,
    porta: number,
    fonte: string | null,
    op?: OpcoesRequisicao,
  ): Promise<void>;
}

export interface DriverHolyrics {
  ler(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<EstadoHolyrics>;
  proximo(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
  anterior(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
  irPara(dispositivo: DispositivoConfig, indice: number, op?: OpcoesRequisicao): Promise<void>;
  encerrarApresentacao(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
  definirF(
    dispositivo: DispositivoConfig,
    tecla: 8 | 9 | 10,
    ativar: boolean,
    op?: OpcoesRequisicao,
  ): Promise<void>;
  /** Exibe um texto avulso — usado como marcador na prova real das legendas. */
  apresentacaoRapida(
    dispositivo: DispositivoConfig,
    texto: string,
    op?: OpcoesRequisicao,
  ): Promise<void>;
  /** Página de legendas que o OBS consome. Devolve o status HTTP observado. */
  checarPaginaLegenda(
    dispositivo: DispositivoConfig,
    op?: OpcoesRequisicao,
  ): Promise<{ status: number; url: string }>;
}

export interface DriverObs {
  ler(dispositivo: DispositivoConfig): Promise<EstadoObs>;
  definirCena(dispositivo: DispositivoConfig, cena: string): Promise<void>;
  /** true quando a source existe na cena atual e está visível. */
  sourceVisivel(dispositivo: DispositivoConfig, source: string): Promise<boolean>;
  /** PNG em base64, usado para comparar antes/depois no teste de legendas. */
  capturarSource(dispositivo: DispositivoConfig, source: string): Promise<string>;
  /** Fecha conexões abertas — chamado no encerramento do hub. */
  encerrar(): Promise<void>;
}

export interface DriverAgente {
  ler(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<EstadoAgente>;
  lerPowerPoint(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<EstadoPowerPoint>;
  comandarPowerPoint(
    dispositivo: DispositivoConfig,
    comando: import('@maestro/shared').ComandoPpt,
    op?: OpcoesRequisicao,
  ): Promise<StatusPpt>;
  /**
   * Manda a máquina se atualizar para um commit. O agente responde na hora e
   * só então começa a troca — ele mesmo sai do ar no meio dela.
   */
  atualizar(dispositivo: DispositivoConfig, sha: string, op?: OpcoesRequisicao): Promise<void>;
  /** Manda uma seta do teclado para um aplicativo, trazendo-o para frente antes. */
  teclaApp(
    dispositivo: DispositivoConfig,
    app: import('@maestro/shared').Aplicativo,
    direcao: 'proximo' | 'anterior',
    op?: OpcoesRequisicao,
  ): Promise<void>;
  /** Abre, fecha, reinicia ou traz para frente um aplicativo daquela máquina. */
  acaoApp(
    dispositivo: DispositivoConfig,
    comando: import('@maestro/shared').ComandoApp,
    op?: OpcoesRequisicao,
  ): Promise<void>;
}

/** Conjunto de drivers injetado nas rotas. Em modo mock, trocado por falsos. */
export interface Drivers {
  ndi: DriverNdi;
  holyrics: DriverHolyrics;
  obs: DriverObs;
  agente: DriverAgente;
}
