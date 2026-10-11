import type {
  DispositivoConfig,
  EstruturaObs,
  EstadoHolyrics,
  ItemPlaylistHolyrics,
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

/** Um gatilho do Holyrics (GetTriggers), já com nomes em português. */
export interface GatilhoHolyrics {
  id: string;
  ativo: boolean;
  /** `displaying`, `closing`, `change` ou `event`. */
  quando: string;
  /** Ex.: `any_song`, `any_verse`. */
  tipo: string;
  /** Ex.: `obs_v5`. null se a API não informou. */
  receptor: string | null;
  descricao: string;
}

export interface DriverHolyrics {
  ler(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<EstadoHolyrics>;
  proximo(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
  anterior(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
  irPara(dispositivo: DispositivoConfig, indice: number, op?: OpcoesRequisicao): Promise<void>;
  encerrarApresentacao(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
  /** Lista de reprodução de músicas (letras) do Holyrics, na ordem em que está montada. */
  listarPlaylist(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<ItemPlaylistHolyrics[]>;
  mostrarLetra(dispositivo: DispositivoConfig, letraId: string, op?: OpcoesRequisicao): Promise<void>;
  /** Exibe um texto bíblico pela referência (ShowVerse), como apresentação normal. */
  mostrarVersiculo(dispositivo: DispositivoConfig, referencia: string, op?: OpcoesRequisicao): Promise<void>;
  /** Gatilhos salvos no Holyrics (GetTriggers, v2.24+). */
  listarGatilhos(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<GatilhoHolyrics[]>;
  definirF(
    dispositivo: DispositivoConfig,
    tecla: 8 | 9 | 10,
    ativar: boolean,
    op?: OpcoesRequisicao,
  ): Promise<void>;
  /**
   * Endereço da página do Holyrics que mostra o que está no telão
   * (`/view/widescreen`), ou null se ela não respondeu em nenhuma porta conhecida.
   */
  paginaVisualizacao(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<string | null>;
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
  /** Cenas, grupos e o que há dentro de cada um — para Ajustes › Legendas sugerir nomes. */
  estrutura(dispositivo: DispositivoConfig): Promise<EstruturaObs>;
  /** Olhinho do item `item` (um grupo, por exemplo) dentro da cena `cena`. */
  itemVisivel(dispositivo: DispositivoConfig, cena: string, item: string): Promise<boolean>;
  definirItemVisivel(dispositivo: DispositivoConfig, cena: string, item: string, visivel: boolean): Promise<void>;
  /** URL que a fonte de navegador abre, ou null se ela usa arquivo local / não é de navegador. */
  urlDaFonte(dispositivo: DispositivoConfig, fonte: string): Promise<string | null>;
  /** O mesmo que clicar em "Atualizar" nas propriedades da fonte de navegador. */
  atualizarFonte(dispositivo: DispositivoConfig, fonte: string): Promise<void>;
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
  /** Imagem do slide no telão (ou do próximo), para o painel mostrar o que a igreja está vendo. */
  miniaturaPowerPoint(
    dispositivo: DispositivoConfig,
    qual: 'atual' | 'proximo',
    op?: OpcoesRequisicao,
  ): Promise<{ imagem: Buffer; tipo: string; slide: number | null }>;
  /**
   * Manda a máquina se atualizar para um commit. O agente responde na hora e
   * só então começa a troca — ele mesmo sai do ar no meio dela.
   */
  atualizar(dispositivo: DispositivoConfig, sha: string, op?: OpcoesRequisicao): Promise<void>;
  /**
   * Manda uma seta do teclado. Com `app`, traz o aplicativo para frente antes;
   * sem ele, vai direto para a janela que estiver na frente da máquina.
   */
  teclaApp(
    dispositivo: DispositivoConfig,
    app: import('@maestro/shared').Aplicativo | undefined,
    direcao: 'proximo' | 'anterior',
    op?: OpcoesRequisicao,
  ): Promise<void>;
  /** Janela de aviso por cima de tudo, no monitor escolhido. Volta quando ela abre. */
  mostrarAviso(
    dispositivo: DispositivoConfig,
    comando: import('@maestro/shared').ComandoAviso,
    op?: OpcoesRequisicao,
  ): Promise<void>;
  /**
   * Print de um monitor (miniatura + amostra em cinza), só em memória. Sem
   * `monitor`, o principal. Sessão bloqueada devolve imagem preta: quem chama decide.
   */
  capturarMonitor(
    dispositivo: DispositivoConfig,
    monitor: string | null | undefined,
    op?: OpcoesRequisicao,
  ): Promise<import('@maestro/shared').CapturaMonitor>;
  /** Acorda a tela da máquina (monitor em repouso por inatividade). */
  acordar(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
  /** Liga ou desliga o "Manter ligado" (sem repouso, sem apagar a tela). Devolve como ficou. */
  manterLigado(dispositivo: DispositivoConfig, ligado: boolean, op?: OpcoesRequisicao): Promise<boolean>;
  /** Fecha qualquer janela de aviso aberta na máquina (a que ficou presa no telão, por exemplo). */
  fecharAvisos(dispositivo: DispositivoConfig, op?: OpcoesRequisicao): Promise<void>;
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
