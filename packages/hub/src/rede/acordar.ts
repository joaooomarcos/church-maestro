import { createSocket } from 'node:dgram';

/** O pacote mágico: 6 bytes 0xFF e depois o MAC repetido 16 vezes. */
export function montarPacoteMagico(mac: string): Buffer | null {
  const bytes = mac.split(/[:-]/);
  if (bytes.length !== 6 || bytes.some((b) => !/^[0-9a-f]{2}$/i.test(b))) return null;
  const endereco = Buffer.from(bytes.map((b) => parseInt(b, 16)));
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => endereco)]);
}

/** Broadcast da rede /24 do host (192.168.0.20 → 192.168.0.255); a rede da igreja é doméstica. */
export function broadcastDaRede(host: string): string | null {
  const partes = host.split('.');
  if (partes.length !== 4 || partes.some((p) => !/^\d{1,3}$/.test(p))) return null;
  return `${partes.slice(0, 3).join('.')}.255`;
}

/**
 * Wake-on-LAN: manda o pacote mágico por broadcast. Só funciona se a máquina
 * estiver com isso ligado na BIOS e no Windows (placa de rede › "permitir que
 * este dispositivo ative o computador"); o envio em si nunca falha por isso.
 */
export async function enviarWakeOnLan(mac: string, host: string): Promise<boolean> {
  const pacote = montarPacoteMagico(mac);
  if (!pacote) return false;
  const destinos = ['255.255.255.255', broadcastDaRede(host)].filter((d): d is string => d !== null);

  const socket = createSocket('udp4');
  try {
    await new Promise<void>((resolver, rejeitar) => {
      socket.once('error', rejeitar);
      socket.bind(0, () => {
        socket.setBroadcast(true);
        resolver();
      });
    });
    await Promise.all(
      destinos.flatMap((destino) =>
        [9, 7].map(
          (porta) =>
            new Promise<void>((resolver, rejeitar) => {
              socket.send(pacote, porta, destino, (erro) => (erro ? rejeitar(erro) : resolver()));
            }),
        ),
      ),
    );
    return true;
  } catch {
    return false;
  } finally {
    socket.close();
  }
}
