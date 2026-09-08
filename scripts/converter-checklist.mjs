// Converte os checklists em HTML (manuais/) para o JSON que o hub consome.
//
// Uso: node scripts/converter-checklist.mjs [pasta-de-saida]
//
// Os HTML são a fonte enquanto a migração não termina. Depois que o checklist
// viver dentro do app, o caminho se inverte: o JSON passa a ser a fonte e o
// gerar_pdf.js produz o impresso a partir dele.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const saida = resolve(raiz, process.argv[2] ?? 'config/checklists');

const ARQUIVOS = [
  { html: 'manuais/checklist_projecao_frente.html', id: 'projecao-frente', nome: 'Projeção Frente', maquina: 'note-frente' },
  { html: 'manuais/checklist_projecao_fundo.html', id: 'projecao-fundo', nome: 'Projeção Fundo', maquina: 'pc-fundo' },
];

const semTags = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

const kebab = (texto) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 6)
    .join('-');

/** Captura o conteúdo de cada elemento com a classe pedida. */
function blocos(html, classe) {
  const achados = [];
  const abertura = new RegExp(`<(\\w+)[^>]*class="[^"]*\\b${classe}\\b[^"]*"[^>]*>`, 'g');
  let m;
  while ((m = abertura.exec(html)) !== null) {
    const tag = m[1];
    let profundidade = 1;
    let i = m.index + m[0].length;
    const inicio = i;
    const varredura = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
    varredura.lastIndex = i;
    let n;
    while (profundidade > 0 && (n = varredura.exec(html)) !== null) {
      profundidade += n[1] === '/' ? -1 : 1;
      i = varredura.lastIndex;
    }
    achados.push({
      interno: html.slice(inicio, i - `</${tag}>`.length),
      inicioTag: m.index,
    });
  }
  return achados;
}

function primeiro(html, classe) {
  const [achado] = blocos(html, classe);
  return achado ? semTags(achado.interno) : null;
}

function converterItem(secaoHtml) {
  const texto = primeiro(secaoHtml, 'item-text');
  if (!texto) return null;

  const etiqueta = primeiro(secaoHtml, 'item-tag');
  const nota = primeiro(secaoHtml, 'item-subnote');
  const dicas = [
    ...blocos(secaoHtml, 'tip-row').map((b) => semTags(b.interno)),
    ...blocos(secaoHtml, 'alert-row').map((b) => semTags(b.interno)),
  ].filter(Boolean);

  // A etiqueta e a nota aparecem dentro do mesmo container do texto; sem tirá-las
  // o item ficaria com o próprio rótulo grudado na frase.
  let limpo = texto;
  for (const extra of [etiqueta, nota].filter(Boolean)) {
    limpo = limpo.replace(extra, '').trim();
  }
  limpo = limpo.replace(/\s*·\s*$/, '').replace(/\s+/g, ' ').trim();

  return {
    id: kebab(limpo),
    texto: limpo,
    etiqueta: etiqueta ?? null,
    nota: nota ? nota.replace(/^·\s*/, '') : null,
    dica: dicas.length > 0 ? dicas.join(' ') : null,
    autoCheck: null,
  };
}

async function converter({ html, id, nome, maquina }) {
  const conteudo = await readFile(resolve(raiz, html), 'utf8');

  const cartoes = blocos(conteudo, 'section-card');
  const resultado = { id, nome, maquina, blocos: [] };

  for (const cartao of cartoes) {
    const titulo = primeiro(cartao.interno, 'section-title');
    if (!titulo) continue;

    const corpo = blocos(cartao.interno, 'section-body')[0];
    const itens = corpo
      ? blocos(corpo.interno, 'checklist-item')
          .map((i) => converterItem(i.interno))
          .filter(Boolean)
      : [];

    // As dicas e alertas ficam como irmãos do item, não dentro dele. Associa cada
    // um ao último item que apareceu antes dele no HTML.
    if (corpo) {
      const posicoesItens = blocos(corpo.interno, 'checklist-item').map((b) => b.inicioTag);
      const avisos = [
        ...blocos(corpo.interno, 'tip-row'),
        ...blocos(corpo.interno, 'alert-row'),
      ];

      for (const aviso of avisos) {
        const texto = semTags(aviso.interno);
        if (!texto) continue;
        let indice = -1;
        for (let k = 0; k < posicoesItens.length; k += 1) {
          const pos = posicoesItens[k];
          if (pos !== undefined && pos < aviso.inicioTag) indice = k;
        }
        const item = indice >= 0 ? itens[indice] : undefined;
        if (!item) continue;
        item.dica = item.dica ? `${item.dica} ${texto}` : texto;
      }
    }

    resultado.blocos.push({
      id: kebab(titulo),
      titulo,
      subtitulo: primeiro(cartao.interno, 'section-subtitle'),
      itens,
    });
  }

  return resultado;
}

await mkdir(saida, { recursive: true });

for (const arquivo of ARQUIVOS) {
  const dados = await converter(arquivo);
  const total = dados.blocos.reduce((n, b) => n + b.itens.length, 0);
  await writeFile(resolve(saida, `${arquivo.id}.json`), `${JSON.stringify(dados, null, 2)}\n`, 'utf8');
  console.log(`${arquivo.id}.json — ${dados.blocos.length} blocos, ${total} itens`);
}
