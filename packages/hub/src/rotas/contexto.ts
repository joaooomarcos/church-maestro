import {
  dispositivoConfigSchema,
  type Cenario,
  type ConfigHub,
  type DispositivoConfig,
  type ResultadoCheck,
} from '@maestro/shared';
import type { Drivers } from '../drivers/tipos.js';
import { salvarDispositivos } from '../config.js';
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
  readonly cenarios: Cenario[];
  dispositivos(): DispositivoConfig[];
  obterDispositivo(id: string): DispositivoConfig | undefined;
  /** Substitui o dispositivo pelo `id` dele (PUT completo) e persiste em config/devices.json. */
  atualizarDispositivo(dispositivo: DispositivoConfig): Promise<DispositivoConfig>;
  /** Publica um resultado de check no WebSocket, para todas as telas verem ao vivo. */
  publicar(resultado: ResultadoCheck): void;
}

export interface OpcoesContexto {
  config: ConfigHub;
  drivers: Drivers;
  store: Store;
  cenarios: Cenario[];
  dispositivos: DispositivoConfig[];
  caminhoDispositivos: string;
}

export function criarContexto(opcoes: OpcoesContexto): ContextoApp {
  let dispositivos = opcoes.dispositivos;

  return {
    config: opcoes.config,
    drivers: opcoes.drivers,
    store: opcoes.store,
    cenarios: opcoes.cenarios,

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
      await salvarDispositivos(opcoes.caminhoDispositivos, dispositivos);
      return validado;
    },

    publicar(resultado) {
      opcoes.store.transmitirMensagem({ tipo: 'check', dados: resultado });
    },
  };
}
