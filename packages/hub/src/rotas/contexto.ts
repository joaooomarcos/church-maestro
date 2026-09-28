import {
  arquivoAutomacoesSchema,
  cenarioSchema,
  configHubSchema,
  dispositivoConfigSchema,
  type ArquivoAutomacoes,
  type Cenario,
  type ConfigHub,
  type DispositivoConfig,
  type ResultadoCheck,
} from '@maestro/shared';
import type { Drivers } from '../drivers/tipos.js';
import {
  salvarAutomacoes,
  salvarCenarios,
  salvarConfigHub,
  salvarDispositivos,
} from '../config.js';
import type { Store } from '../estado/store.js';

/**
 * Tudo que as rotas (as minhas e as de `checks/index.ts`) precisam para atender uma
 * requisição. `registrarRotasChecks(app, ctx)` recebe este objeto — os nomes
 * `drivers`, `dispositivos()` e `publicar()` seguem `ContextoCheck` (checks/tipos.ts)
 * de propósito, para o mesmo `ctx` servir os dois lados.
 */
export interface ContextoApp {
  readonly config: ConfigHub;
  readonly drivers: Drivers;
  readonly store: Store;
  /** Hub rodando com dados de demonstração (npm run dev): nada de mexer em máquina de verdade. */
  readonly modoDemo: boolean;
  dispositivos(): DispositivoConfig[];
  obterDispositivo(id: string): DispositivoConfig | undefined;
  /** Substitui o dispositivo pelo `id` dele (PUT completo) e persiste em config/devices.json. */
  atualizarDispositivo(dispositivo: DispositivoConfig): Promise<DispositivoConfig>;
  /**
   * Cadastra (ou recadastra) um dispositivo vindo do pareamento. `idAnterior`
   * remove o registro antigo quando a máquina mudou de nome, para não deixar
   * dois cadastros da mesma máquina no painel.
   */
  registrarDispositivo(
    dispositivo: DispositivoConfig,
    idAnterior?: string,
  ): Promise<DispositivoConfig>;
  /**
   * Muda um ajuste do hub e grava em config/hub.json. O objeto de configuração
   * é alterado no lugar, então quem já o tem em mãos (autenticação, rotas de
   * agente) passa a enxergar o valor novo sem reiniciar o hub.
   */
  atualizarConfigHub(parcial: Partial<ConfigHub>): Promise<ConfigHub>;
  cenarios(): Cenario[];
  /** Cria ou substitui pelo `id` e grava em config/scenarios.json. */
  salvarCenario(cenario: Cenario): Promise<Cenario>;
  /** Remove o cenário e os agendamentos que apontavam para ele. */
  removerCenario(id: string): Promise<void>;
  automacoes(): ArquivoAutomacoes;
  salvarAutomacoes(automacoes: ArquivoAutomacoes): Promise<ArquivoAutomacoes>;
  /** Publica um resultado de check no WebSocket, para todas as telas verem ao vivo. */
  publicar(resultado: ResultadoCheck): void;
}

export interface OpcoesContexto {
  config: ConfigHub;
  drivers: Drivers;
  store: Store;
  cenarios: Cenario[];
  automacoes?: ArquivoAutomacoes;
  dispositivos: DispositivoConfig[];
  caminhoDispositivos: string;
  caminhoHub: string;
  caminhoCenarios?: string;
  caminhoAutomacoes?: string;
  /**
   * false em modo mock: os dispositivos são de mentira e gravá-los apagaria o
   * cadastro real se alguém rodasse `npm run dev` na máquina da igreja.
   */
  persistir?: boolean;
}

export function criarContexto(opcoes: OpcoesContexto): ContextoApp {
  let dispositivos = opcoes.dispositivos;
  let cenarios = opcoes.cenarios;
  let automacoes = opcoes.automacoes ?? arquivoAutomacoesSchema.parse({});
  const persistir = opcoes.persistir !== false;

  async function gravarAutomacoes(): Promise<void> {
    if (persistir && opcoes.caminhoAutomacoes) await salvarAutomacoes(opcoes.caminhoAutomacoes, automacoes);
  }

  async function gravarCenarios(): Promise<void> {
    if (persistir && opcoes.caminhoCenarios) await salvarCenarios(opcoes.caminhoCenarios, cenarios);
  }

  return {
    config: opcoes.config,
    drivers: opcoes.drivers,
    store: opcoes.store,
    modoDemo: !persistir,

    dispositivos: () => dispositivos,

    obterDispositivo: (id) => dispositivos.find((d) => d.id === id),

    async atualizarDispositivo(dispositivo) {
      const validado = dispositivoConfigSchema.parse(dispositivo);
      const indice = dispositivos.findIndex((d) => d.id === validado.id);
      if (indice === -1) {
        throw new Error(`dispositivo "${validado.id}" não está cadastrado`);
      }
      const proximos = [...dispositivos];
      proximos[indice] = validado;
      dispositivos = proximos;
      if (persistir) await salvarDispositivos(opcoes.caminhoDispositivos, dispositivos);
      return validado;
    },

    async registrarDispositivo(dispositivo, idAnterior) {
      const validado = dispositivoConfigSchema.parse(dispositivo);
      const base =
        idAnterior && idAnterior !== validado.id
          ? dispositivos.filter((d) => d.id !== idAnterior)
          : dispositivos;
      const indice = base.findIndex((d) => d.id === validado.id);
      const proximos = [...base];
      if (indice === -1) proximos.push(validado);
      else proximos[indice] = validado;
      dispositivos = proximos;
      if (persistir) await salvarDispositivos(opcoes.caminhoDispositivos, dispositivos);
      return validado;
    },

    async atualizarConfigHub(parcial) {
      const validada = configHubSchema.parse({ ...opcoes.config, ...parcial });
      Object.assign(opcoes.config, validada);
      if (persistir) await salvarConfigHub(opcoes.caminhoHub, validada);
      return validada;
    },

    cenarios: () => cenarios,

    async salvarCenario(cenario) {
      const validado = cenarioSchema.parse(cenario);
      const indice = cenarios.findIndex((c) => c.id === validado.id);
      const proximos = [...cenarios];
      if (indice === -1) proximos.push(validado);
      else proximos[indice] = validado;
      cenarios = proximos;
      await gravarCenarios();
      return validado;
    },

    async removerCenario(id) {
      cenarios = cenarios.filter((c) => c.id !== id);
      const restantes = automacoes.agendamentos.filter((a) => a.cenarioId !== id);
      await gravarCenarios();
      if (restantes.length !== automacoes.agendamentos.length) {
        automacoes = { ...automacoes, agendamentos: restantes };
        await gravarAutomacoes();
      }
    },

    automacoes: () => automacoes,

    async salvarAutomacoes(novas) {
      automacoes = arquivoAutomacoesSchema.parse(novas);
      await gravarAutomacoes();
      return automacoes;
    },

    publicar(resultado) {
      opcoes.store.transmitirMensagem({ tipo: 'check', dados: resultado });
    },
  };
}
