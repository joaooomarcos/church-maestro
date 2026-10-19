import { ErroDriver, type DriverAgente, type OpcoesRequisicao } from './tipos.js';
import { capturaMonitorSchema } from '@maestro/shared';
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
          mac?: string;
          so: 'windows' | 'linux' | 'darwin';
          uptimeS: number;
          processos: Record<string, boolean>;
          capacidades: string[];
          atualizacao?: EstadoAgente['atualizacao'];
          emPrimeiroPlano?: EstadoAgente['emPrimeiroPlano'];
          appsInstalados?: EstadoAgente['appsInstalados'];
          monitores?: EstadoAgente['monitores'];
          manterLigado?: boolean;
        }>(dispositivo, '/health', { method: 'GET' }, op, tokenPadrao);

        return {
          online: true,
          erro: null,
          versao: saude.versao,
          ...(saude.versaoSha ? { versaoSha: saude.versaoSha } : {}),
          ...(saude.versaoNotas ? { versaoNotas: saude.versaoNotas } : {}),
          ...(saude.mac ? { mac: saude.mac } : {}),
          ...(saude.atualizacao ? { atualizacao: saude.atualizacao } : {}),
          so: saude.so,
          uptimeS: saude.uptimeS,
          processos: saude.processos as EstadoAgente['processos'],
          emPrimeiroPlano: saude.emPrimeiroPlano ?? null,
          ...(saude.appsInstalados ? { appsInstalados: saude.appsInstalados } : {}),
          ...(saude.monitores ? { monitores: saude.monitores } : {}),
          capacidades: saude.capacidades as EstadoAgente['capacidades'],
          ...(typeof saude.manterLigado === 'boolean' ? { manterLigado: saude.manterLigado } : {}),
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

    async janelaAberta(dispositivo, app, op): Promise<boolean> {
      try {
        const { janela } = await pedir<{ janela: boolean }>(
          dispositivo,
          `/apps/janela?app=${encodeURIComponent(app)}`,
          { method: 'GET' },
          // A consulta abre um PowerShell: leva uns segundos no Windows.
          { timeoutMs: 15_000, ...(op ?? {}) },
          tokenPadrao,
        );
        return janela;
      } catch (err) {
        if (!(err instanceof ErroDriver) || err.causaTecnica !== 'HTTP 404') throw err;
        // Agente de antes da 0.9.0: vale o processo estar rodando.
        const processos = await pedir<Record<string, boolean>>(dispositivo, '/processos', { method: 'GET' }, op, tokenPadrao);
        return processos[app] === true;
      }
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

    async mostrarAviso(dispositivo, comando, op): Promise<void> {
      await pedir<{ ok: boolean }>(
        dispositivo,
        '/aviso',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(comando),
        },
        // O agente espera uns segundos para ter certeza de que a janela abriu.
        { timeoutMs: 10_000, ...(op ?? {}) },
        tokenPadrao,
      );
    },

    async capturarMonitor(dispositivo, monitor, op) {
      const bruto = await pedir<unknown>(
        dispositivo,
        '/captura',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ monitor: monitor ?? null }),
        },
        // O PowerShell sobe, tira o print e redimensiona: mais que a leitura de estado.
        { timeoutMs: 20_000, ...(op ?? {}) },
        tokenPadrao,
      );
      const captura = capturaMonitorSchema.safeParse(bruto);
      if (!captura.success) {
        throw new ErroDriver(
          `O agente do ${dispositivo.nome} devolveu uma captura que não entendi. Atualize o agente dessa máquina.`,
          captura.error.message,
        );
      }
      return captura.data;
    },

    async acordar(dispositivo, op): Promise<void> {
      await pedir<{ ok: boolean }>(
        dispositivo,
        '/acordar',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        { timeoutMs: 10_000, ...(op ?? {}) },
        tokenPadrao,
      );
    },

    async manterLigado(dispositivo, ligado, op): Promise<boolean> {
      const resposta = await pedir<{ ligado: boolean }>(
        dispositivo,
        '/manter-ligado',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ligado }) },
        { timeoutMs: 10_000, ...(op ?? {}) },
        tokenPadrao,
      );
      return resposta.ligado;
    },

    async fecharAvisos(dispositivo, op): Promise<void> {
      await pedir<{ ok: boolean }>(
        dispositivo,
        '/aviso/fechar',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        { timeoutMs: 10_000, ...(op ?? {}) },
        tokenPadrao,
      );
    },

    async teclaApp(dispositivo, app, direcao, op): Promise<void> {
      await pedir<{ ok: boolean }>(
        dispositivo,
        '/teclas',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...(app ? { app } : {}), direcao }),
        },
        { timeoutMs: 8000, ...(op ?? {}) },
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

    async miniaturaPowerPoint(dispositivo, qual, op) {
      const cfg = dispositivo.servicos.agente;
      if (!cfg || !dispositivo.host) {
        throw new ErroDriver(`O dispositivo "${dispositivo.nome}" não tem o agente configurado.`);
      }
      const token = cfg.token ?? tokenPadrao;
      let resposta: Response;
      try {
        resposta = await fetch(`http://${dispositivo.host}:${cfg.porta}/ppt/slide?qual=${qual}`, {
          headers: token ? { 'x-maestro-token': token } : {},
          // Exportar um slide pesado leva mais que a leitura de estado.
          signal: op?.sinal ?? AbortSignal.timeout(op?.timeoutMs ?? 8000),
        });
      } catch (err) {
        throw new ErroDriver(
          `O agente do ${dispositivo.nome} não respondeu.`,
          err instanceof Error ? err.message : String(err),
        );
      }
      if (!resposta.ok) {
        const corpo = (await resposta.json().catch(() => null)) as { mensagem?: string } | null;
        throw new ErroDriver(corpo?.mensagem ?? `Não consegui a imagem do slide do ${dispositivo.nome}.`, `HTTP ${resposta.status}`);
      }
      const numero = Number(resposta.headers.get('x-maestro-slide'));
      return {
        imagem: Buffer.from(await resposta.arrayBuffer()),
        tipo: resposta.headers.get('content-type') ?? 'image/jpeg',
        slide: Number.isFinite(numero) && numero > 0 ? numero : null,
      };
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
