// PostToolUse (Edit|Write): roda o typecheck do monorepo quando um .ts/.tsx de packages/ é editado.
// Saída com código 2 devolve os erros ao Claude; qualquer outro caso passa em silêncio.
import { spawnSync } from 'node:child_process';

const entrada = JSON.parse(await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s || '{}'));
}));

const arquivo = entrada.tool_input?.file_path ?? '';
if (!/\/packages\/[^/]+\/src\/.*\.tsx?$/.test(arquivo)) process.exit(0);

const raiz = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const pacote = arquivo.match(/\/packages\/([^/]+)\//)?.[1];

// web tem tsconfig próprio; shared/hub/agent usam project references (npm run typecheck)
const r = pacote === 'web'
  ? spawnSync('npm', ['run', 'typecheck', '-w', '@maestro/web'], { cwd: raiz, encoding: 'utf8' })
  : spawnSync('npm', ['run', 'typecheck'], { cwd: raiz, encoding: 'utf8' });

if (r.status !== 0) {
  process.stderr.write(`Typecheck falhou após editar ${arquivo}:\n${(r.stdout + r.stderr).slice(-3000)}`);
  process.exit(2);
}
