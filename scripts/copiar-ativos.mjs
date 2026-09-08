// Copia arquivos que o tsc não conhece (o script PowerShell da ponte com o
// PowerPoint) para junto do JavaScript compilado.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ativos = [['packages/agent/src/ppt/ponte.ps1', 'packages/agent/dist/ppt/ponte.ps1']];

for (const [origem, destino] of ativos) {
  const alvo = resolve(raiz, destino);
  await mkdir(dirname(alvo), { recursive: true });
  await copyFile(resolve(raiz, origem), alvo);
  console.log(`copiado: ${destino}`);
}
