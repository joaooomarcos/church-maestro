import { networkInterfaces } from 'node:os';
import { PORTAS_PADRAO, SERVICO_HUB } from '@maestro/shared';

const TIMEOUT_MS = 600;
const CONCORRENCIA = 64;

export interface HubEncontrado {
  host: string;
  url: string;
  /** Mesmo hub visto por dois endereços tem a mesma instância. */
  instancia?: string;
}

/** IPv4 desta máquina, fora loopback. O primeiro costuma ser o da rede da igreja. */
export function ipsLocais(): string[] {
  const ips: string[] = [];
  for (const enderecos of Object.values(networkInterfaces())) {
    for (const info of enderecos ?? []) {
      const ehIpv4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (ehIpv4 && !info.internal) ips.push(info.address);
    }
  }
  return ips;
}

/** Todos os endereços do /24 de cada interface local, sem repetir. */
function candidatos(): string[] {
  const vistos = new Set<string>(['127.0.0.1']);
  for (const ip of ipsLocais()) {
    const [a, b, c] = ip.split('.');
    if (a === undefined || b === undefined || c === undefined) continue;
    for (let d = 1; d < 255; d++) vistos.add(`${a}.${b}.${c}.${d}`);
  }
  return [...vistos];
}

/** Devolve a instância do hub que atende nesse endereço, ou `undefined` se não for um. */
async function identificarHub(host: string, porta: number): Promise<string | undefined> {
  try {
    const resposta = await fetch(`http://${host}:${porta}/health`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!resposta.ok) return undefined;
    const dados = (await resposta.json()) as { servico?: string; instancia?: string };
    if (dados.servico !== SERVICO_HUB) return undefined;
    return dados.instancia ?? `${host}:${porta}`;
  } catch {
    return undefined;
  }
}

/** Confirma que um endereço digitado à mão é mesmo um hub do Maestro. */
export async function confirmarHub(host: string, porta = PORTAS_PADRAO.hub): Promise<boolean> {
  return (await identificarHub(host, porta)) !== undefined;
}

/**
 * A máquina que roda o hub o encontra duas vezes (127.0.0.1 e o IP da rede).
 * Mantém um endereço por instância, preferindo o loopback: ele não muda quando
 * o roteador troca o IP da máquina.
 */
function juntarPorInstancia(achados: HubEncontrado[]): HubEncontrado[] {
  const porInstancia = new Map<string, HubEncontrado>();
  for (const hub of achados) {
    const chave = hub.instancia ?? hub.url;
    const atual = porInstancia.get(chave);
    if (!atual || hub.host === '127.0.0.1') porInstancia.set(chave, hub);
  }
  return [...porInstancia.values()];
}

/**
 * Procura hubs do Maestro na rede local. Varre o /24 de cada interface em
 * paralelo; numa rede de igreja (254 endereços) leva poucos segundos.
 */
export async function procurarHubs(porta: number = PORTAS_PADRAO.hub): Promise<HubEncontrado[]> {
  const hosts = candidatos();
  const encontrados: HubEncontrado[] = [];
  let proximo = 0;

  async function trabalhador(): Promise<void> {
    for (;;) {
      const indice = proximo++;
      if (indice >= hosts.length) return;
      const host = hosts[indice] as string;
      const instancia = await identificarHub(host, porta);
      if (instancia !== undefined) {
        encontrados.push({ host, url: `http://${host}:${porta}`, instancia });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCORRENCIA, hosts.length) }, () => trabalhador()),
  );
  return juntarPorInstancia(encontrados);
}
