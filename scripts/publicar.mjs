/**
 * Libera para as máquinas da igreja a versão que está em HEAD.
 *
 * Marca no `canal.json` qual commit é o recomendado. O painel destaca essa
 * versão como "(aprovada)" na aba Versões, e o instalador usa ela em máquina
 * nova — mas nada é aplicado sozinho: quem atualiza é quem opera, pelo painel.
 *
 * Uso:
 *   npm run publicar                 libera o commit atual
 *   npm run publicar -- --desligar   desliga a atualização automática
 *   npm run publicar -- <sha>        volta as máquinas para um commit anterior
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoCanal = resolve(raiz, 'canal.json');

function git(...args) {
  return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();
}

function sair(mensagem) {
  console.error(`\nerro: ${mensagem}\n`);
  process.exit(1);
}

const argumentos = process.argv.slice(2);
const desligar = argumentos.includes('--desligar');
const shaPedido = argumentos.find((a) => /^[0-9a-f]{7,40}$/i.test(a));

if (git('status', '--porcelain')) {
  sair('há mudanças não commitadas. Faça o commit antes de publicar, senão as máquinas recebem uma versão diferente da sua.');
}

const sha = shaPedido ? git('rev-parse', shaPedido) : git('rev-parse', 'HEAD');
const notas = git('log', '-1', '--format=%s', sha);

const canal = JSON.parse(readFileSync(caminhoCanal, 'utf8'));
const anterior = canal.sha;
if (desligar) {
  canal.ativo = false;
} else {
  canal.ativo = true;
  canal.sha = sha;
  canal.notas = notas;
  canal.liberadoEm = new Date().toISOString().slice(0, 10);
}
writeFileSync(caminhoCanal, `${JSON.stringify(canal, null, 2)}\n`, 'utf8');

const assunto = desligar
  ? 'Desliga a atualização automática das máquinas'
  : `Libera ${sha.slice(0, 7)} para as máquinas da igreja`;

git('add', 'canal.json');
git('commit', '-m', `${assunto}\n\n${desligar ? 'Kill switch: as máquinas param de se atualizar sozinhas.' : notas}`);
git('push', 'origin', 'HEAD');

console.log(`\n${assunto}`);
if (!desligar) {
  console.log(`anterior: ${anterior?.slice(0, 7) ?? '—'}`);
  console.log(`agora:    ${sha.slice(0, 7)} — ${notas}`);
}
console.log('\nNenhuma máquina pega isso sozinha: aplique pela aba Versões do painel,');
console.log('uma máquina de cada vez. Para desmarcar: npm run publicar -- <sha-anterior>');
