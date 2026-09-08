import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
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

function slugificar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos decompostos pelo NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function criarConfigPadrao(): Promise<ConfigAgente> {
  const dispositivoId = slugificar(hostname()) || 'agente';
  const token = randomBytes(24).toString('hex');
  const config = configAgenteSchema.parse({
    dispositivoId,
    porta: 8770,
    token,
    intervaloHeartbeatMs: 10_000,
  });

  await mkdir(dirname(CAMINHO_CONFIG), { recursive: true });
  await writeFile(CAMINHO_CONFIG, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  console.log('[agente] nenhuma config encontrada, criei uma nova em', CAMINHO_CONFIG);
  console.log('[agente] dispositivoId:', dispositivoId);
  // O heartbeat é autenticado contra `tokenAgentes` do hub, então o segredo tem
  // de vir de lá — gerar um aqui serve só para o arquivo nascer válido.
  console.log('[agente] IMPORTANTE: substitua "token" pelo valor de "tokenAgentes"');
  console.log('[agente] do arquivo config/hub.json do PC Transmissão.');
  console.log('[agente] token provisório:', token);
  console.log('[agente] defina "hubUrl" em', CAMINHO_CONFIG, 'para o agente se anunciar sozinho.');

  return config;
}

/** Carrega `config/agent.json`, criando um esqueleto na primeira execução. */
export async function carregarConfig(): Promise<ConfigAgente> {
  let bruto: string;
  try {
    bruto = await readFile(CAMINHO_CONFIG, 'utf8');
  } catch {
    return aplicarOverridesDeAmbiente(await criarConfigPadrao());
  }

  const json: unknown = JSON.parse(bruto);
  const config = configAgenteSchema.parse(json);
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
