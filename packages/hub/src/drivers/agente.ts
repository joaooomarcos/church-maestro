import { ErroDriver, type DriverAgente, type OpcoesRequisicao } from './tipos.js';
import type {
  DispositivoConfig,
  EstadoAgente,
  EstadoPowerPoint,
  ComandoPpt,
  StatusPpt,
} from '@maestro/shared';

/**
 * Cliente do agente que roda em cada máquina da igreja.
 *
 * O token é um segredo só, compartilhado entre o hub e todos os agentes: o
 * mesmo valor vai em `hub.json` (tokenAgentes) e no `agent.json` de cada
 * máquina. Um dispositivo pode sobrescrever com um token próprio, mas o padrão
 * evita que a instalação vire uma caça a três segredos diferentes.
 */

const TIMEOUT_PADRAO_MS = 1500;

async function pedir<T>(
  dispositivo: DispositivoConfig,
  caminho: string,
  init: RequestInit,
  op: OpcoesRequisicao | undefined,
  tokenPadrao: string | undefined,
): Promise<T> {
  const cfg = dispositivo.servicos.agente;
  if (!cfg) {
    throw new ErroDriver(`O dispositivo "${dispositivo.nome}" não tem o agente configurado.`);
  }
  if (!dispositivo.host) {
    throw new ErroDriver(`O dispositivo "${dispositivo.nome}" está sem endereço de rede.`);
  }

  const token = cfg.token ?? tokenPadrao;

  let resposta: Response;
  try {
    resposta = await fetch(`http://${dispositivo.host}:${cfg.porta}${caminho}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(token ? { 'x-maestro-token': token } : {}),
      },
      signal: op?.sinal ?? AbortSignal.timeout(op?.timeoutMs ?? TIMEOUT_PADRAO_MS),
    });
  } catch (err) {
    throw new ErroDriver(
      `O agente do ${dispositivo.nome} não respondeu. A máquina pode estar desligada ou o agente não foi iniciado.`,
      err instanceof Error ? err.message : String(err),
    );
  }

  if (resposta.status === 401) {
    throw new ErroDriver(
      `O agente do ${dispositivo.nome} recusou o token. Confira se o token no hub é o mesmo do arquivo config/agent.json daquela máquina.`,
    );
  }
  if (resposta.status === 501) {
    throw new ErroDriver(`O ${dispositivo.nome} não tem PowerPoint disponível.`);
  }
  if (!resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { mensagem?: string } | null;
    throw new ErroDriver(
      corpo?.mensagem ?? `O agente do ${dispositivo.nome} respondeu com erro.`,
      `HTTP ${resposta.status}`,
    );
  }

  return (await resposta.json()) as T;
}

export function criarDriverAgente(tokenPadrao?: string): DriverAgente {
  return {
    async ler(dispositivo, op): Promise<EstadoAgente> {
      try {
        const saude = await pedir<{
          versao: string;
          versaoSha?: string;
          versaoNotas?: string;
          so: 'windows' | 'linux' | 'darwin';
          uptimeS: number;
          processos: Record<string, boolean>;
          capacidades: string[];
          atualizacao?: EstadoAgente['atualizacao'];
          emPrimeiroPlano?: EstadoAgente['emPrimeiroPlano'];
        }>(dispositivo, '/health', { method: 'GET' }, op, tokenPadrao);

        return {
          online: true,
          erro: null,
          versao: saude.versao,
          ...(saude.versaoSha ? { versaoSha: saude.versaoSha } : {}),
          ...(saude.versaoNotas ? { versaoNotas: saude.versaoNotas } : {}),
          ...(saude.atualizacao ? { atualizacao: saude.atualizacao } : {}),
          so: saude.so,
          uptimeS: saude.uptimeS,
          processos: saude.processos as EstadoAgente['processos'],
          emPrimeiroPlano: saude.emPrimeiroPlano ?? null,
          capacidades: saude.capacidades as EstadoAgente['capacidades'],
        };
      } catch (err) {
        return {
          online: false,
          erro: err instanceof ErroDriver ? err.message : String(err),
          processos: {},
          emPrimeiroPlano: null,
          capacidades: [],
        };
      }
    },

    async atualizar(dispositivo, sha, op): Promise<void> {
      await pedir<{ aceito: boolean }>(
        dispositivo,
        '/atualizar',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sha }),
        },
        op,
        tokenPadrao,
      );
    },

    async acaoApp(dispositivo, comando, op): Promise<void> {
      await pedir<{ ok: boolean }>(
        dispositivo,
        '/apps/acao',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(comando),
        },
        // Abrir um programa pesado (o Holyrics, por exemplo) passa do timeout curto.
        { timeoutMs: 30_000, ...(op ?? {}) },
        tokenPadrao,
      );
    },

    async lerPowerPoint(dispositivo, op): Promise<EstadoPowerPoint> {
      try {
        const status = await pedir<StatusPpt>(
          dispositivo,
          '/ppt/status',
          { method: 'GET' },
          op,
          tokenPadrao,
        );
        return { online: true, erro: null, ...status };
      } catch (err) {
        return {
          online: false,
          erro: err instanceof ErroDriver ? err.message : String(err),
          emApresentacao: false,
          slide: null,
          totalSlides: null,
          arquivo: null,
        };
      }
    },

    async comandarPowerPoint(dispositivo, comando: ComandoPpt, op): Promise<StatusPpt> {
      return pedir<StatusPpt>(
        dispositivo,
        '/ppt/acao',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(comando),
        },
        op,
        tokenPadrao,
      );
    },
  };
}
