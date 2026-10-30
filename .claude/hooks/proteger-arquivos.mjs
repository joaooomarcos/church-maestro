// PreToolUse (Edit|Write): bloqueia edição manual de arquivos gerados ou de operação.
const entrada = JSON.parse(await new Promise((ok) => {
  let s = '';
  process.stdin.on('data', (c) => (s += c));
  process.stdin.on('end', () => ok(s || '{}'));
}));

const arquivo = entrada.tool_input?.file_path ?? '';

const protegidos = [
  [/\/package-lock\.json$/, 'package-lock.json é gerado pelo npm'],
  [/\/(dist|node_modules)\//, 'dist/ e node_modules/ são gerados'],
  [/\/data\//, 'data/ guarda dados de execução'],
  [/\/canal\.json$/, 'canal.json define o que as máquinas da igreja recebem — só via npm run publicar, com aprovação do João'],
  [/\/config\/(hub|agent|agent-estado|devices|automacoes|convidados)\.json$/, 'configuração local da instalação (tokens e PIN)'],
];

for (const [regra, motivo] of protegidos) {
  if (regra.test(arquivo)) {
    process.stderr.write(`Edição bloqueada: ${motivo}.\nPeça confirmação ao usuário antes de alterar ${arquivo}.`);
    process.exit(2);
  }
}
