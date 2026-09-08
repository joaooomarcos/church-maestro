import type { EstadoDispositivo, HeartbeatAgente, MensagemHub, Snapshot } from '@maestro/shared';
import type { ServicoDescoberto } from '@maestro/shared';

/** Um agente sem heartbeat há mais tempo que isso é considerado offline. */
export const JANELA_HEARTBEAT_MS = 30_000;

interface RegistroHeartbeat {
  ts: number;
  dados: HeartbeatAgente;
}

/**
 * Interface mínima de um socket de WebSocket — evitamos depender do tipo da
 * lib `ws` diretamente aqui (ela não é dependência direta do pacote; quem a
 * traz é o `@fastify/websocket`), só do que de fato usamos.
 */
export interface SocketTransmissao {
  readyState: number;
  send(dados: string): void;
}

const WS_ABERTO = 1;

/** Guarda o snapshot atual, os heartbeats dos agentes, e distribui tudo via WebSocket. */
export class Store {
  private snapshot: Snapshot;
  private readonly heartbeats = new Map<string, RegistroHeartbeat>();
  private readonly sockets = new Set<SocketTransmissao>();

  constructor() {
    this.snapshot = { ts: Date.now(), revisao: 0, dispositivos: [], naoIdentificados: [] };
  }

  obterSnapshot(): Snapshot {
    return this.snapshot;
  }

  /** Substitui os dispositivos do snapshot, sobe a revisão e transmite. */
  atualizarDispositivos(dispositivos: EstadoDispositivo[]): void {
    this.snapshot = {
      ts: Date.now(),
      revisao: this.snapshot.revisao + 1,
      dispositivos,
      naoIdentificados: this.snapshot.naoIdentificados,
    };
    this.transmitirSnapshot();
  }

  /** Atualiza só a lista de serviços descobertos na rede que não pertencem a dispositivo algum. */
  definirNaoIdentificados(servicos: ServicoDescoberto[]): void {
    this.snapshot = {
      ts: Date.now(),
      revisao: this.snapshot.revisao + 1,
      dispositivos: this.snapshot.dispositivos,
      naoIdentificados: servicos
        .filter((s) => !s.dispositivoId)
        .map((s) => ({ host: s.host, porta: s.porta, tipo: s.tipo })),
    };
    this.transmitirSnapshot();
  }

  registrarHeartbeat(dispositivoId: string, dados: HeartbeatAgente): void {
    this.heartbeats.set(dispositivoId, { ts: Date.now(), dados });
  }

  obterHeartbeat(dispositivoId: string): RegistroHeartbeat | undefined {
    return this.heartbeats.get(dispositivoId);
  }

  heartbeatRecente(dispositivoId: string): boolean {
    const registro = this.heartbeats.get(dispositivoId);
    if (!registro) return false;
    return Date.now() - registro.ts < JANELA_HEARTBEAT_MS;
  }

  /** Chamado quando uma conexão WS abre: registra e já manda o snapshot atual. */
  adicionarSocket(socket: SocketTransmissao): void {
    this.sockets.add(socket);
    this.enviar(socket, { tipo: 'snapshot', dados: this.snapshot });
  }

  removerSocket(socket: SocketTransmissao): void {
    this.sockets.delete(socket);
  }

  transmitirMensagem(mensagem: MensagemHub): void {
    for (const socket of this.sockets) {
      this.enviar(socket, mensagem);
    }
  }

  private transmitirSnapshot(): void {
    this.transmitirMensagem({ tipo: 'snapshot', dados: this.snapshot });
  }

  private enviar(socket: SocketTransmissao, mensagem: MensagemHub): void {
    if (socket.readyState !== WS_ABERTO) return;
    try {
      socket.send(JSON.stringify(mensagem));
    } catch {
      // conexão pode ter caído entre o check de readyState e o send; ignora.
    }
  }
}
