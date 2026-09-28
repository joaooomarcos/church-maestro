/**
 * Libera uma versão numerada para as máquinas da igreja.
 *
 * O número segue x.y.z: funcionalidade nova sobe o do meio (0.1.0 → 0.2.0),
 * correção sobe o último (0.2.0 → 0.2.1). O número mora no package.json de
 * todos os pacotes; o `canal.json` guarda a versão aprovada e o histórico
 * (número → commit), que é de onde o painel tira a lista de Sistema › Versões.
 *
 * Nada é aplicado sozinho: quem atualiza cada máquina é quem opera, pelo painel.
 *
 * Uso:
 *   npm run publicar -- funcionalidade   sobe 0.1.0 → 0.2.0 e libera
 *   npm run publicar -- correcao         sobe 0.2.0 → 0.2.1 e libera
 *   npm run publicar -- 0.1.0            volta as máquinas para uma versão já liberada
 *   npm run publicar -- --desligar       para de oferecer versão nova ao instalador
 *
 *   --notas "texto"   descrição da versão (padrão: o assunto do último commit)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const caminhoCanal = resolve(raiz, 'canal.json');
const PACOTES = ['', 'packages/shared', 'packages/hub', 'packages/agent', 'packages/web'];
const MAXIMO_HISTORICO = 40;
const VERSAO_VALIDA = /^\d+\.\d+\.\d+$/;

function git(...args) {
  return execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();
}

function sair(mensagem) {
  console.error(`\nerro: ${mensagem}\n`);
  process.exit(1);
}

function lerJson(caminho) {
  return JSON.parse(readFileSync(caminho, 'utf8'));
}

function gravarJson(caminho, dados) {
  writeFileSync(caminho, `${JSON.stringify(dados, null, 2)}\n`, 'utf8');
}

function comparar(a, b) {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function subir(versao, parte) {
  const [maior, meio, menor] = versao.split('.').map(Number);
  if (parte === 'maior') return `${maior + 1}.0.0`;
  if (parte === 'meio') return `${maior}.${meio + 1}.0`;
  return `${maior}.${meio}.${menor + 1}`;
}

/** Troca o número em todos os package.json e no package-lock, que o `npm ci` confere. */
function gravarVersao(versao) {
  for (const pasta of PACOTES) {
    const caminho = resolve(raiz, pasta, 'package.json');
    const pkg = lerJson(caminho);
    pkg.version = versao;
    gravarJson(caminho, pkg);
  }
  const caminhoLock = resolve(raiz, 'package-lock.json');
  const lock = lerJson(caminhoLock);
  lock.version = versao;
  for (const pasta of PACOTES) {
    if (lock.packages?.[pasta]) lock.packages[pasta].version = versao;
  }
  gravarJson(caminhoLock, lock);
}

// ---------------------------------------------------------------------------

const argumentos = process.argv.slice(2);
const desligar = argumentos.includes('--desligar');
const indiceNotas = argumentos.indexOf('--notas');
const notasPedidas = indiceNotas >= 0 ? argumentos[indiceNotas + 1] : undefined;
const pedido = argumentos.find((a, i) => !a.startsWith('--') && (indiceNotas < 0 || i !== indiceNotas + 1));

if (git('status', '--porcelain')) {
  sair('há mudanças não commitadas. Faça o commit antes de publicar, senão as máquinas recebem uma versão diferente da sua.');
}

const canal = lerJson(caminhoCanal);
const historico = Array.isArray(canal.versoes) ? canal.versoes : [];
const atual = lerJson(resolve(raiz, 'package.json')).version;

if (desligar) {
  canal.ativo = false;
  gravarJson(caminhoCanal, canal);
  git('add', 'canal.json');
  git('commit', '-m', 'Desliga a oferta de versão nova\n\nO instalador volta a usar o topo do main.');
  git('push', 'origin', 'HEAD');
  console.log('\nCanal desligado.');
  process.exit(0);
}

const PARTES = { funcionalidade: 'meio', minor: 'meio', correcao: 'menor', 'correção': 'menor', patch: 'menor', major: 'maior' };

let versao;
let sha;
let notas;
let novaVersao = false;

if (pedido && VERSAO_VALIDA.test(pedido) && historico.some((v) => v.versao === pedido)) {
  // Voltar (ou avançar) as máquinas para uma versão que já foi liberada.
  const registro = historico.find((v) => v.versao === pedido);
  ({ versao, sha, notas } = registro);
} else if (pedido && (PARTES[pedido] || VERSAO_VALIDA.test(pedido))) {
  if (VERSAO_VALIDA.test(pedido)) {
    if (comparar(pedido, atual) < 0) sair(`${pedido} é menor que a versão atual (${atual}) e nunca foi liberada.`);
    versao = pedido;
  } else {
    versao = subir(atual, PARTES[pedido]);
  }
  if (historico.some((v) => v.versao === versao)) {
    sair(`a ${versao} já foi liberada. Para voltar as máquinas para ela: npm run publicar -- ${versao}`);
  }
  notas = notasPedidas ?? git('log', '-1', '--format=%s');
  novaVersao = true;

  // Na primeira liberação o número já está no package.json: não há o que subir.
  if (versao !== atual) {
    gravarVersao(versao);
    git('add', ...PACOTES.map((pasta) => resolve(raiz, pasta, 'package.json')), 'package-lock.json');
    git('commit', '-m', `Versão ${versao}\n\n${notas}`);
  }
  sha = git('rev-parse', 'HEAD');
  git('tag', '-a', `v${versao}`, '-m', `Versão ${versao} — ${notas}`);
} else {
  sair(
    [
      'diga que tipo de versão é:',
      `  npm run publicar -- funcionalidade   ${atual} → ${subir(atual, 'meio')}`,
      `  npm run publicar -- correcao         ${atual} → ${subir(atual, 'menor')}`,
      '  npm run publicar -- <x.y.z>          volta para uma versão já liberada',
    ].join('\n'),
  );
}

const anterior = canal.versao ?? canal.sha?.slice(0, 7) ?? '—';
const hoje = new Date().toISOString().slice(0, 10);
canal.ativo = true;
canal.versao = versao;
canal.sha = sha;
canal.notas = notas;
canal.liberadoEm = hoje;
if (novaVersao) {
  canal.versoes = [{ versao, sha, notas, data: hoje }, ...historico].slice(0, MAXIMO_HISTORICO);
}
gravarJson(caminhoCanal, canal);

const assunto = `Libera a versão ${versao} para as máquinas da igreja`;
git('add', 'canal.json');
git('commit', '-m', `${assunto}\n\n${notas}`);
git('push', 'origin', 'HEAD');
if (novaVersao) git('push', 'origin', `refs/tags/v${versao}`);

console.log(`\n${assunto}`);
console.log(`anterior: ${anterior}`);
console.log(`agora:    ${versao} (${sha.slice(0, 7)}) — ${notas}`);
console.log('\nNenhuma máquina pega isso sozinha: aplique em Sistema › Versões, no painel,');
console.log('uma máquina de cada vez.');
