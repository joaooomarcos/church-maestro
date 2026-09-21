import type {
  DispositivoConfig,
  EstadoAgente,
  EstadoDispositivo,
  EstadoHolyrics,
  EstadoNdiMonitor,
  EstadoObs,
  EstadoPowerPoint,
} from '@maestro/shared';
import { ErroDriver, type Drivers } from '../drivers/tipos.js';
import type { Store } from './store.js';

/** Timeout curto por leitura — é rede local, se não respondeu rápido não vai responder. */
const TIMEOUT_LEITURA_MS = 1500;

function mensagemErro(erro: unknown): string {
  if (erro instanceof ErroDriver) return erro.message;
  if (erro instanceof Error) return erro.message;
  return 'erro desconhecido ao consultar o dispositivo';
}

/** Corta a promessa no tempo — necessário porque nem todo método de driver aceita `timeoutMs`. */
function comTimeout<T>(promessa: Promise<T>, ms = TIMEOUT_LEITURA_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(() => {
      reject(new Error(`tempo esgotado após ${ms}ms`));
    }, ms);
    promessa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (erro: unknown) => {
        clearTimeout(temporizador);
        reject(erro);
      },
    );
  });
}

function estadoAgenteFalha(erro: string): EstadoAgente {
  return { online: false, erro, processos: {}, emPrimeiroPlano: null, capacidades: [] };
}

function estadoPowerPointFalha(erro: string): EstadoPowerPoint {
  return { online: false, erro, emApresentacao: false, slide: null, totalSlides: null, arquivo: null };
}

function estadoHolyricsFalha(erro: string): EstadoHolyrics {
  return { online: false, erro, apresentacao: null };
}

function estadoObsFalha(erro: string): EstadoObs {
  return {
    online: false,
    erro,
    cenaAtual: null,
    cenas: [],
    transmitindo: false,
    gravando: false,
    tempoTransmissaoS: 0,
    bitrateKbps: 0,
    framesPerdidos: 0,
    percFramesPerdidos: 0,
  };
}

function estadoNdiFalha(porta: number, erro: string): EstadoNdiMonitor {
  return { online: false, erro, porta, fonteAtual: null, fontesDisponiveis: [] };
}

/** Estado de um dispositivo sem host configurado: nada a tentar, simplesmente offline. */
function estadoDispositivoSemHost(dispositivo: DispositivoConfig): EstadoDispositivo {
  return {
    id: dispositivo.id,
    nome: dispositivo.nome,
    host: dispositivo.host,
    online: false,
    ultimoContato: null,
    ndi: [],
  };
}

/** Usado só como rede de segurança final, se `lerDispositivo` mesmo assim escapar um erro. */
function estadoDispositivoFalhaTotal(dispositivo: DispositivoConfig, erro: string): EstadoDispositivo {
  return {
    id: dispositivo.id,
    nome: dispositivo.nome,
    host: dispositivo.host,
    online: false,
    ultimoContato: null,
    ndi: [],
    agente: dispositivo.servicos.agente ? estadoAgenteFalha(erro) : undefined,
    holyrics: dispositivo.servicos.holyrics ? estadoHolyricsFalha(erro) : undefined,
    obs: dispositivo.servicos.obs ? estadoObsFalha(erro) : undefined,
  };
}

/** Lê um dispositivo inteiro: chama só os drivers dos serviços configurados, em paralelo, isolando falhas. */
async function lerDispositivo(
  dispositivo: DispositivoConfig,
  drivers: Drivers,
  store: Store,
): Promise<EstadoDispositivo> {
  if (!dispositivo.host) {
    return estadoDispositivoSemHost(dispositivo);
  }

  try {
    const svc = dispositivo.servicos;
    const op = { timeoutMs: TIMEOUT_LEITURA_MS };

    let algumaIntegracaoOk = false;
    let agente: EstadoAgente | undefined;
    let powerpoint: EstadoPowerPoint | undefined;
    let holyrics: EstadoHolyrics | undefined;
    let obs: EstadoObs | undefined;
    const ndi: EstadoNdiMonitor[] = [];

    const tarefas: Promise<void>[] = [];

    if (svc.agente) {
      // O PowerPoint só é consultado depois que o agente confirma que aquela
      // máquina tem essa capacidade — o Note Som roda Linux, e perguntar por
      // slides lá a cada dois segundos seria uma chamada perdida.
      tarefas.push(
        comTimeout(drivers.agente.ler(dispositivo, op))
          .then(async (r) => {
            agente = r;
            if (r.online) algumaIntegracaoOk = true;
            if (!r.online || !r.capacidades.includes('powerpoint')) return;

            try {
              const ppt = await comTimeout(drivers.agente.lerPowerPoint(dispositivo, op));
              powerpoint = ppt;
              if (ppt.online) algumaIntegracaoOk = true;
            } catch (e: unknown) {
              powerpoint = estadoPowerPointFalha(mensagemErro(e));
            }
          })
          .catch((e: unknown) => {
            agente = estadoAgenteFalha(mensagemErro(e));
          }),
      );
    }

    if (svc.holyrics) {
      tarefas.push(
        comTimeout(drivers.holyrics.ler(dispositivo, op))
          .then((r) => {
            holyrics = r;
            if (r.online) algumaIntegracaoOk = true;
          })
          .catch((e: unknown) => {
            holyrics = estadoHolyricsFalha(mensagemErro(e));
          }),
      );
    }

    if (svc.obs) {
      tarefas.push(
        comTimeout(drivers.obs.ler(dispositivo))
          .then((r) => {
            obs = r;
            if (r.online) algumaIntegracaoOk = true;
          })
          .catch((e: unknown) => {
            obs = estadoObsFalha(mensagemErro(e));
          }),
      );
    }

    if (svc.ndiMonitor) {
      for (const porta of svc.ndiMonitor.portas) {
        tarefas.push(
          comTimeout(drivers.ndi.ler(dispositivo.host, porta, op))
            .then((r) => {
              ndi.push(r);
              if (r.online) algumaIntegracaoOk = true;
            })
            .catch((e: unknown) => {
              ndi.push(estadoNdiFalha(porta, mensagemErro(e)));
            }),
        );
      }
    }

    await Promise.allSettled(tarefas);

    const heartbeat = store.obterHeartbeat(dispositivo.id);
    const heartbeatRecente = store.heartbeatRecente(dispositivo.id);
    const online = algumaIntegracaoOk || heartbeatRecente;
    const ultimoContato = algumaIntegracaoOk
      ? Date.now()
      : heartbeatRecente && heartbeat
        ? heartbeat.ts
        : null;

    return {
      id: dispositivo.id,
      nome: dispositivo.nome,
      host: dispositivo.host,
      online,
      ultimoContato,
      agente,
      powerpoint,
      holyrics,
      obs,
      ndi,
    };
  } catch (erro) {
    // Nenhum dos caminhos acima deveria chegar aqui (cada driver tem seu próprio catch),
    // mas isso garante que um bug de driver nunca derruba o laço de polling.
    return estadoDispositivoFalhaTotal(dispositivo, mensagemErro(erro));
  }
}

export interface OpcoesPoller {
  /** Getter em vez de array fixo: a lista de dispositivos pode mudar via PUT /api/dispositivos. */
  dispositivos(): DispositivoConfig[];
  drivers: Drivers;
  store: Store;
  intervaloMs: number;
}

export class Poller {
  private temporizador: NodeJS.Timeout | undefined;
  private executando = false;

  constructor(private readonly opcoes: OpcoesPoller) {}

  iniciar(): void {
    void this.executarCiclo();
    this.temporizador = setInterval(() => {
      void this.executarCiclo();
    }, this.opcoes.intervaloMs);
  }

  parar(): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = undefined;
    }
  }

  private async executarCiclo(): Promise<void> {
    if (this.executando) return; // evita sobrepor ciclos se a rede estiver lenta
    this.executando = true;
    try {
      const dispositivos = this.opcoes.dispositivos();
      const resultados = await Promise.allSettled(
        dispositivos.map((d) => lerDispositivo(d, this.opcoes.drivers, this.opcoes.store)),
      );
      const estados = resultados.map((resultado, indice) => {
        if (resultado.status === 'fulfilled') return resultado.value;
        const dispositivo = dispositivos[indice];
        // Índices vêm do mesmo `.map`, então `dispositivo` sempre existe aqui.
        return estadoDispositivoFalhaTotal(dispositivo as DispositivoConfig, mensagemErro(resultado.reason));
      });
      this.opcoes.store.atualizarDispositivos(estados);
    } finally {
      this.executando = false;
    }
  }
}
