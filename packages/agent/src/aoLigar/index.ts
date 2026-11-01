import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  execucaoAoLigarSchema,
  rotinaAoLigarSchema,
  type ExecucaoAoLigar,
  type RespostaAoLigar,
  type RotinaAoLigar,
} from '@maestro/shared';
import { z } from 'zod';
import { CAMINHO_ESTADO } from '../config.js';
import { executarPassos, type DependenciasRotina } from './passos.js';

/**
 * "Ao ligar" no agente: ao subir, ele decide sozinho se a máquina acabou de
 * ligar e, se sim, roda a rotina dela. Não depende do hub.
 *
 * "Acabou de ligar" não vem do uptime do Windows (com a inicialização rápida
 * ele não zera ao desligar), e sim de quanto tempo o agente ficou sem dar sinal:
 * ele anota que está vivo a cada 30 s. Reiniciar o agente no meio do culto
 * (atualização, queda) deixa uma ausência curta e não reabre programa nenhum.
 */

/** Menos que isto sem sinal é reinício do agente, não máquina que ligou. */
export const AUSENCIA_MINIMA_MS = 2 * 60_000;
/** Ausência tão longa que só pode ser máquina desligada. */
export const AUSENCIA_LONGA_MS = 30 * 60_000;
/** Entre os dois limites, só vale se o Windows também acabou de subir. */
export const UPTIME_RECENTE_S = 10 * 60;
export const INTERVALO_VIVO_MS = 30_000;

export function pareceLigacao(entrada: { vivoEm: number | undefined; agora: number; uptimeS: number }): boolean {
  // Sem anotação nenhuma é a primeira vez deste agente: instalar no meio do culto não pode abrir nada.
  if (entrada.vivoEm === undefined) return false;
  const ausencia = entrada.agora - entrada.vivoEm;
  if (ausencia < AUSENCIA_MINIMA_MS) return false;
  return ausencia >= AUSENCIA_LONGA_MS || entrada.uptimeS < UPTIME_RECENTE_S;
}

const estadoSchema = z.object({
  vivoEm: z.number().optional(),
  ultimaExecucaoAoLigar: execucaoAoLigarSchema.optional(),
});

export type EstadoAnotado = z.infer<typeof estadoSchema>;

export interface ArmazemEstado {
  ler(): Promise<EstadoAnotado>;
  gravar(mudanca: Partial<EstadoAnotado>): Promise<void>;
}

export function criarArmazemEmArquivo(caminho: string = CAMINHO_ESTADO): ArmazemEstado {
  let atual: EstadoAnotado | undefined;
  let fila: Promise<void> = Promise.resolve();

  async function ler(): Promise<EstadoAnotado> {
    if (atual) return atual;
    try {
      atual = estadoSchema.parse(JSON.parse(await readFile(caminho, 'utf8')));
    } catch {
      atual = {};
    }
    return atual;
  }

  return {
    ler,
    gravar(mudanca) {
      fila = fila.then(async () => {
        atual = { ...(await ler()), ...mudanca };
        await mkdir(dirname(caminho), { recursive: true });
        await writeFile(caminho, `${JSON.stringify(atual, null, 2)}\n`, 'utf8');
      });
      return fila.catch(() => {
        // anotar é só uma ajuda: falhar em gravar não pode derrubar o agente
      });
    },
  };
}

export interface OpcoesServicoAoLigar {
  rotina: RotinaAoLigar | undefined;
  deps: DependenciasRotina;
  armazem: ArmazemEstado;
  /** Grava a rotina no config/agent.json. */
  gravarRotina(rotina: RotinaAoLigar): Promise<void>;
  uptimeS(): number;
  intervaloVivoMs?: number;
  /** Tela de controle desta máquina: abre sozinha quando a rotina do boot falha, para mostrar o que deu errado. */
  urlControle?: string;
}

export interface ServicoAoLigar {
  estado(): Promise<RespostaAoLigar>;
  salvar(rotina: RotinaAoLigar): Promise<RespostaAoLigar>;
  /**
   * "Testar agora": começa já, sem esperar a máquina ligar, e volta na hora (a rotina
   * pode demorar minutos); o resultado aparece em `estado()`. Recusa se já houver
   * uma execução em andamento.
   */
  iniciarTeste(): void;
  iniciar(): Promise<void>;
  parar(): void;
}

export class ExecucaoEmAndamento extends Error {
  constructor() {
    super('A rotina "ao ligar" já está rodando. Espere ela terminar.');
    this.name = 'ExecucaoEmAndamento';
  }
}

export function criarServicoAoLigar(opcoes: OpcoesServicoAoLigar): ServicoAoLigar {
  const { deps, armazem } = opcoes;
  let rotina: RotinaAoLigar = rotinaAoLigarSchema.parse(opcoes.rotina ?? {});
  let executando = false;
  let parado = false;
  let temporizadorVivo: NodeJS.Timeout | undefined;
  let cancelarEspera: (() => void) | undefined;

  async function executar(origem: ExecucaoAoLigar['origem'], passos: RotinaAoLigar['passos']): Promise<ExecucaoAoLigar> {
    if (executando) throw new ExecucaoEmAndamento();
    executando = true;
    try {
      const execucao = await executarPassos(passos, deps, origem);
      await armazem.gravar({ ultimaExecucaoAoLigar: execucao });
      return execucao;
    } finally {
      executando = false;
    }
  }

  /** Espera `esperaSegundos` (dá tempo de o Windows subir) e roda o que estiver salvo naquela hora. */
  function agendarDoBoot(): void {
    executando = true;
    const espera = rotina.esperaSegundos * 1000;
    const timer = setTimeout(() => {
      cancelarEspera = undefined;
      executando = false;
      // Revalida: vale a rotina de agora, não a de quando ligou.
      if (parado || !rotina.ativo || rotina.passos.length === 0) return;
      void executar('boot', rotina.passos)
        .then(async (execucao) => {
          if (execucao.ok || !opcoes.urlControle || parado) return;
          await deps.abrirPagina(`${opcoes.urlControle}#ao-ligar`);
        })
        .catch(() => {
          // executarPassos isola a falha de cada passo; sem navegador a falha continua na tela de controle
        });
    }, espera);
    cancelarEspera = () => clearTimeout(timer);
  }

  async function estado(): Promise<RespostaAoLigar> {
    const { ultimaExecucaoAoLigar } = await armazem.ler();
    return { rotina, ultimaExecucao: ultimaExecucaoAoLigar ?? null, executando };
  }

  return {
    estado,

    async salvar(nova) {
      rotina = rotinaAoLigarSchema.parse(nova);
      await opcoes.gravarRotina(rotina);
      return estado();
    },

    iniciarTeste() {
      if (executando) throw new ExecucaoEmAndamento();
      void executar('teste', rotina.passos).catch(() => {
        // executarPassos isola a falha de cada passo
      });
    },

    async iniciar() {
      const anotado = await armazem.ler();
      const agora = deps.agora();
      const ligou = pareceLigacao({ vivoEm: anotado.vivoEm, agora, uptimeS: opcoes.uptimeS() });

      await armazem.gravar({ vivoEm: agora });
      temporizadorVivo = setInterval(() => void armazem.gravar({ vivoEm: deps.agora() }), opcoes.intervaloVivoMs ?? INTERVALO_VIVO_MS);
      temporizadorVivo.unref();

      if (ligou && rotina.ativo && rotina.passos.length > 0) agendarDoBoot();
    },

    parar() {
      parado = true;
      if (temporizadorVivo) clearInterval(temporizadorVivo);
      cancelarEspera?.();
    },
  };
}
