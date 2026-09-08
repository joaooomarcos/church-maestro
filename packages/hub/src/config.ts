import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arquivoCenariosSchema,
  arquivoDispositivosSchema,
  configHubSchema,
  type ArquivoCenarios,
  type Cenario,
  type ConfigHub,
  type DispositivoConfig,
} from '@maestro/shared';

const aqui = path.dirname(fileURLToPath(import.meta.url));

/** Raiz do monorepo, calculada a partir deste arquivo (funciona em src/ e em dist/). */
export const raizRepo = path.join(aqui, '../../..');
export const pastaConfig = path.join(raizRepo, 'config');

export interface CaminhosConfig {
  hub: string;
  dispositivos: string;
  cenarios: string;
}

export function obterCaminhosConfig(pasta: string = pastaConfig): CaminhosConfig {
  return {
    hub: path.join(pasta, 'hub.json'),
    dispositivos: path.join(pasta, 'devices.json'),
    cenarios: path.join(pasta, 'scenarios.json'),
  };
}

/** Escreve em `<arquivo>.tmp` e faz `rename` — evita ficar com JSON pela metade se cair no meio. */
async function escreverArquivoAtomico(caminho: string, conteudo: string): Promise<void> {
  await fs.mkdir(path.dirname(caminho), { recursive: true });
  const temporario = `${caminho}.${process.pid}.tmp`;
  await fs.writeFile(temporario, conteudo, 'utf8');
  await fs.rename(temporario, caminho);
}

async function lerJsonSeExistir(caminho: string): Promise<unknown | undefined> {
  try {
    const bruto = await fs.readFile(caminho, 'utf8');
    return JSON.parse(bruto) as unknown;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error(
      `não foi possível ler "${caminho}": ${erro instanceof Error ? erro.message : String(erro)}`,
    );
  }
}

function dispositivosEsqueleto(): DispositivoConfig[] {
  const base: Array<Pick<DispositivoConfig, 'id' | 'nome'>> = [
    { id: 'pc-transmissao', nome: 'PC Transmissão' },
    { id: 'note-frente', nome: 'Note Frente' },
    { id: 'pc-fundo', nome: 'PC Fundo' },
    { id: 'note-som', nome: 'Note Som' },
  ];
  return base.map((d) => ({ ...d, host: '', fixarHost: false, servicos: {} }));
}

/**
 * Carrega config/hub.json; se não existir, cria com PIN e segredos gerados e
 * avisa no log — é a única vez que esses valores aparecem em texto puro.
 */
export async function carregarOuCriarConfigHub(
  caminho: string,
  log: Pick<Console, 'warn'> = console,
): Promise<ConfigHub> {
  const bruto = await lerJsonSeExistir(caminho);
  if (bruto === undefined) {
    const config = configHubSchema.parse({
      pin: '1234',
      segredoSessao: randomBytes(24).toString('hex'),
      tokenAgentes: randomBytes(24).toString('hex'),
    });
    await escreverArquivoAtomico(caminho, JSON.stringify(config, null, 2));
    log.warn(
      `[maestro] criei ${caminho} com o PIN padrão "1234" — troque em Configurações antes do culto.`,
    );
    return config;
  }
  const resultado = configHubSchema.safeParse(bruto);
  if (!resultado.success) {
    throw new Error(`config/hub.json inválido: ${resultado.error.message}`);
  }
  return resultado.data;
}

/** Carrega config/devices.json; se não existir, cria o esqueleto das 4 máquinas conhecidas. */
export async function carregarOuCriarDispositivos(caminho: string): Promise<DispositivoConfig[]> {
  const bruto = await lerJsonSeExistir(caminho);
  if (bruto === undefined) {
    const arquivo = arquivoDispositivosSchema.parse({ dispositivos: dispositivosEsqueleto() });
    await escreverArquivoAtomico(caminho, JSON.stringify(arquivo, null, 2));
    return arquivo.dispositivos;
  }
  const resultado = arquivoDispositivosSchema.safeParse(bruto);
  if (!resultado.success) {
    throw new Error(`config/devices.json inválido: ${resultado.error.message}`);
  }
  return resultado.data.dispositivos;
}

/** Carrega config/scenarios.json; se não existir, cria vazio — a equipe cadastra pela UI. */
export async function carregarOuCriarCenarios(caminho: string): Promise<Cenario[]> {
  const bruto = await lerJsonSeExistir(caminho);
  if (bruto === undefined) {
    const arquivo: ArquivoCenarios = arquivoCenariosSchema.parse({ cenarios: [] });
    await escreverArquivoAtomico(caminho, JSON.stringify(arquivo, null, 2));
    return arquivo.cenarios;
  }
  const resultado = arquivoCenariosSchema.safeParse(bruto);
  if (!resultado.success) {
    throw new Error(`config/scenarios.json inválido: ${resultado.error.message}`);
  }
  return resultado.data.cenarios;
}

export async function salvarDispositivos(
  caminho: string,
  dispositivos: DispositivoConfig[],
): Promise<void> {
  const arquivo = arquivoDispositivosSchema.parse({ dispositivos });
  await escreverArquivoAtomico(caminho, JSON.stringify(arquivo, null, 2));
}

export interface Configuracao {
  hub: ConfigHub;
  dispositivos: DispositivoConfig[];
  cenarios: Cenario[];
  caminhos: CaminhosConfig;
}

export async function carregarConfiguracao(pasta: string = pastaConfig): Promise<Configuracao> {
  const caminhos = obterCaminhosConfig(pasta);
  const [hub, dispositivos, cenarios] = await Promise.all([
    carregarOuCriarConfigHub(caminhos.hub),
    carregarOuCriarDispositivos(caminhos.dispositivos),
    carregarOuCriarCenarios(caminhos.cenarios),
  ]);
  return { hub, dispositivos, cenarios, caminhos };
}
