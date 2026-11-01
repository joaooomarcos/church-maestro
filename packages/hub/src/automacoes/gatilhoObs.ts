import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ehGatilhoObs, type Cenario, type EstadoObs, type GatilhoObs } from '@maestro/shared';
import { formatarEspera } from '../cenarios/executar.js';
import type { ContextoApp } from '../rotas/contexto.js';
import { chaveDoDia, horarioNoDia } from './agendador.js';
import { executarERegistrar } from './historico.js';

/** Cena, transmissão, dia e hora: o que precisa valer para a contagem começar. */
export function condicaoAtendida(gatilho: GatilhoObs, obs: EstadoObs | undefined, agora: Date): boolean {
  if (!gatilho.ativo || !obs?.online || !obs.transmitindo || obs.cenaAtual !== gatilho.cena) return false;
  if (!gatilho.dias.includes(agora.getDay())) return false;
  return agora.getTime() >= horarioNoDia(agora, gatilho.aPartirDe).getTime();
}

export interface MonitorObs {
  /** Lê do disco o que já rodou hoje; chamar antes de `iniciar`. */
  carregar(): Promise<void>;
  iniciar(intervaloMs: number): void;
  parar(): void;
  /** Uma volta de verificação; exposta para os testes. */
  verificar(): Promise<void>;
}

export interface OpcoesMonitorObs {
  /** Último dia em que cada gatilho rodou. */
  caminhoMarcas: string;
  relogio?: () => Date;
}

async function lerMarcas(caminho: string): Promise<Map<string, string>> {
  try {
    const bruto: unknown = JSON.parse(await readFile(caminho, 'utf8'));
    const pares = Object.entries(bruto as Record<string, unknown>).filter(
      (par): par is [string, string] => typeof par[1] === 'string',
    );
    return new Map(pares);
  } catch {
    // Sem arquivo (ou estragado), o pior caso é rodar de novo um cenário de hoje.
    return new Map();
  }
}

/**
 * Observa o estado que o poller já lê do OBS, em vez dos eventos do WebSocket:
 * evento perdido numa queda de conexão não volta, e o estado sempre diz a
 * verdade da hora. Depois que a contagem começa, a troca de cena não importa
 * (a equipe alterna entre câmeras no início do culto); só parar a transmissão
 * cancela. Leitura que falhou não decide nada: espera o OBS responder de novo.
 *
 * O dia em que cada gatilho rodou fica em disco, ao contrário do agendador: a
 * condição continua valendo depois de disparar, e um hub reiniciado no meio do
 * culto rodaria o cenário outra vez.
 */
export function criarMonitorObs(ctx: ContextoApp, opcoes: OpcoesMonitorObs): MonitorObs {
  const relogio = opcoes.relogio ?? (() => new Date());
  let marcas = new Map<string, string>();
  /** Quando cada contagem em andamento começou. */
  const contagens = new Map<string, number>();
  let temporizador: NodeJS.Timeout | undefined;

  async function gravarMarcas(): Promise<void> {
    try {
      await mkdir(path.dirname(opcoes.caminhoMarcas), { recursive: true });
      await writeFile(opcoes.caminhoMarcas, JSON.stringify(Object.fromEntries(marcas)));
    } catch {
      ctx.store.transmitirMensagem({
        tipo: 'aviso',
        nivel: 'alerta',
        texto: 'Automação do OBS: não consegui gravar que ela já rodou. Se o painel reiniciar hoje, ela pode rodar de novo.',
      });
    }
  }

  function avisar(nivel: 'info' | 'alerta', texto: string): void {
    ctx.store.transmitirMensagem({ tipo: 'aviso', nivel, texto });
  }

  async function disparar(gatilho: GatilhoObs, cenario: Cenario | undefined, agora: Date): Promise<void> {
    contagens.delete(gatilho.id);
    // Marca antes de rodar: um cenário longo não pode começar duas vezes.
    marcas.set(gatilho.id, chaveDoDia(agora));
    await gravarMarcas();
    if (!cenario) return;
    const { resultado, registro } = await executarERegistrar(ctx, cenario, 'obs', gatilho.id);
    avisar(
      resultado.ok ? 'info' : 'alerta',
      resultado.ok
        ? `Automação do OBS: "${cenario.nome}" aplicado.`
        : `Automação do OBS: "${cenario.nome}" teve falhas — ${registro.resumo}`,
    );
  }

  async function verificar(): Promise<void> {
    const automacoes = ctx.automacoes();
    const gatilhos = automacoes.ativo ? automacoes.agendamentos.filter(ehGatilhoObs).filter((g) => g.ativo) : [];
    // Removido, desligado ou com as automações desligadas: a contagem some em silêncio.
    for (const id of contagens.keys()) {
      if (!gatilhos.some((g) => g.id === id)) contagens.delete(id);
    }

    const agora = relogio();
    const estados = ctx.store.obterSnapshot().dispositivos;
    const disparos: Promise<void>[] = [];
    for (const gatilho of gatilhos) {
      const obs = estados.find((d) => d.id === gatilho.dispositivo)?.obs;
      const cenario = ctx.cenarios().find((c) => c.id === gatilho.cenarioId);
      let inicio = contagens.get(gatilho.id);

      if (inicio === undefined) {
        if (marcas.get(gatilho.id) === chaveDoDia(agora) || !condicaoAtendida(gatilho, obs, agora)) continue;
        inicio = agora.getTime();
        contagens.set(gatilho.id, inicio);
        if (gatilho.esperaSegundos > 0) {
          avisar('info', `OBS na cena "${gatilho.cena}": "${cenario?.nome ?? 'cenário'}" roda em ${formatarEspera(gatilho.esperaSegundos * 1000)}.`);
        }
      }

      if (!obs?.online) continue;
      if (!obs.transmitindo) {
        contagens.delete(gatilho.id);
        avisar('alerta', `A transmissão parou: "${cenario?.nome ?? 'cenário'}" não vai rodar agora.`);
        continue;
      }
      if (agora.getTime() - inicio >= gatilho.esperaSegundos * 1000) {
        disparos.push(disparar(gatilho, cenario, agora));
      }
    }
    await Promise.allSettled(disparos);
  }

  return {
    async carregar() {
      marcas = await lerMarcas(opcoes.caminhoMarcas);
    },
    iniciar(intervaloMs) {
      temporizador = setInterval(() => void verificar(), intervaloMs);
    },
    parar() {
      if (temporizador) clearInterval(temporizador);
    },
    verificar,
  };
}
