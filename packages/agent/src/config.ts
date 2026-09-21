import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configAgenteSchema, type ConfigAgente } from '@maestro/shared';

/**
 * `src/config.ts` e `dist/config.js` ficam ambos dois níveis abaixo da raiz
 * do repo (`packages/agent/{src,dist}`), então a mesma conta serve rodando
 * via tsx ou já compilado.
 */
const RAIZ_REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CAMINHO_CONFIG = resolve(RAIZ_REPO, 'config/agent.json');

export class ConfigAusente extends Error {
  constructor() {
    super(
      'Esta máquina ainda não foi configurada. Rode "npm run setup" nela para o assistente parear com o hub.',
    );
    this.name = 'ConfigAusente';
  }
}

/** Devolve a config já salva, ou `undefined` na primeira execução. */
export async function carregarConfigSeExistir(): Promise<ConfigAgente | undefined> {
  let bruto: string;
  try {
    bruto = await readFile(CAMINHO_CONFIG, 'utf8');
  } catch {
    return undefined;
  }
  const json: unknown = JSON.parse(bruto);
  return configAgenteSchema.parse(json);
}

export async function salvarConfig(config: ConfigAgente): Promise<ConfigAgente> {
  const validada = configAgenteSchema.parse(config);
  await mkdir(dirname(CAMINHO_CONFIG), { recursive: true });
  await writeFile(CAMINHO_CONFIG, `${JSON.stringify(validada, null, 2)}\n`, 'utf8');
  return validada;
}

/** Carrega `config/agent.json`. Sem arquivo, manda rodar o assistente. */
export async function carregarConfig(): Promise<ConfigAgente> {
  const config = await carregarConfigSeExistir();
  if (!config) throw new ConfigAusente();
  return aplicarOverridesDeAmbiente(config);
}

/** MAESTRO_HUB_URL e MAESTRO_DISPOSITIVO_ID facilitam testar sem editar o arquivo. */
function aplicarOverridesDeAmbiente(config: ConfigAgente): ConfigAgente {
  const hubUrl = process.env['MAESTRO_HUB_URL'];
  const dispositivoId = process.env['MAESTRO_DISPOSITIVO_ID'];
  return {
    ...config,
    ...(hubUrl ? { hubUrl } : {}),
    ...(dispositivoId ? { dispositivoId } : {}),
  };
}

export { CAMINHO_CONFIG };
