import net from 'node:net';
import { hostname, platform } from 'node:os';
import { createInterface, type Interface } from 'node:readline/promises';
import {
  APLICATIVOS,
  NOMES_APLICATIVOS,
  PORTAS_PADRAO,
  ROTAS,
  respostaPareamentoSchema,
  slugificar,
  type DispositivoConfig,
  type PedidoPareamento,
  type RespostaPareamento,
} from '@maestro/shared';
import { detectarCaminhos } from './apps/index.js';
import { CAMINHO_CONFIG, carregarConfigSeExistir, salvarConfig } from './config.js';
import { confirmarHub, ipsLocais, procurarHubs } from './descoberta.js';

type Servicos = DispositivoConfig['servicos'];
type ServicoHolyrics = NonNullable<Servicos['holyrics']>;
type ServicoNdi = NonNullable<Servicos['ndiMonitor']>;
type ServicoObs = NonNullable<Servicos['obs']>;

/** Os serviços desta máquina são testados nela mesma, não pela rede. */
const LOCAL = '127.0.0.1';

function titulo(texto: string): void {
  console.log(`\n\x1b[36m=== ${texto} ===\x1b[0m`);
}

function ok(texto: string): void {
  console.log(`\x1b[32m${texto}\x1b[0m`);
}

function aviso(texto: string): void {
  console.log(`\x1b[33m${texto}\x1b[0m`);
}

function passos(linhas: string[]): void {
  for (const linha of linhas) console.log(`   ${linha}`);
}

async function perguntar(rl: Interface, texto: string, padrao = ''): Promise<string> {
  const sufixo = padrao ? ` [${padrao}]` : '';
  const resposta = (await rl.question(`${texto}${sufixo}: `)).trim();
  return resposta || padrao;
}

async function confirmar(rl: Interface, texto: string, padraoSim = true): Promise<boolean> {
  const dica = padraoSim ? '[S/n]' : '[s/N]';
  for (;;) {
    const resposta = (await rl.question(`${texto} ${dica} `)).trim().toLowerCase();
    if (!resposta) return padraoSim;
    if (['s', 'sim', 'y', 'yes'].includes(resposta)) return true;
    if (['n', 'nao', 'não', 'no'].includes(resposta)) return false;
    console.log('Responda "s" para sim ou "n" para não.');
  }
}

async function perguntarPorta(rl: Interface, texto: string, padrao: number): Promise<number> {
  for (;;) {
    const bruto = await perguntar(rl, texto, String(padrao));
    const numero = Number(bruto);
    if (Number.isInteger(numero) && numero > 0 && numero < 65536) return numero;
    console.log(`Porta inválida — digite um número, por exemplo ${padrao}.`);
  }
}

/** O obs-websocket não fala HTTP, então o teste possível aqui é a porta estar aberta. */
function portaAberta(host: string, porta: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let respondido = false;
    const terminar = (aberta: boolean): void => {
      if (respondido) return;
      respondido = true;
      socket.destroy();
      resolve(aberta);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => terminar(true));
    socket.once('timeout', () => terminar(false));
    socket.once('error', () => terminar(false));
    socket.connect(porta, host);
  });
}

async function escolherHub(rl: Interface): Promise<string> {
  titulo('1 de 6 — Encontrar o hub');
  console.log('Procurando o hub do Maestro na rede. Leva alguns segundos…');
  const achados = await procurarHubs();

  if (achados.length === 1) {
    const unico = achados[0] as { url: string };
    if (await confirmar(rl, `Achei o hub em ${unico.url}. É esse?`)) return unico.url;
  } else if (achados.length > 1) {
    console.log('Achei mais de um hub:');
    achados.forEach((hub, indice) => console.log(`   ${indice + 1}) ${hub.url}`));
    const escolha = await perguntar(rl, 'Qual deles? (número, ou Enter para digitar o endereço)');
    const alvo = achados[Number(escolha) - 1];
    if (alvo) return alvo.url;
  } else {
    aviso('Não achei nenhum hub na rede.');
    passos([
      'O hub roda no PC Transmissão — confira se ele está ligado e na mesma rede.',
      'Lá, o painel abre em http://localhost:8700.',
    ]);
  }

  for (;;) {
    const bruto = await perguntar(rl, 'Digite o IP do PC Transmissão (ex.: 192.168.18.18)');
    const host = bruto.replace(/^https?:\/\//, '').split(':')[0]?.trim() ?? '';
    if (host) {
      process.stdout.write(`Testando ${host}… `);
      if (await confirmarHub(host)) {
        console.log('achei o hub.');
        return `http://${host}:${PORTAS_PADRAO.hub}`;
      }
      console.log('não respondeu.');
    }
    if (!(await confirmar(rl, 'Quer tentar outro endereço?'))) {
      throw new Error(
        'sem hub não dá para parear. Suba o hub no PC Transmissão e rode o assistente de novo.',
      );
    }
  }
}

async function escolherNome(rl: Interface, padrao: string): Promise<string> {
  titulo('2 de 6 — Nome desta máquina');
  console.log('É o nome que a equipe vê no painel, como "PC Transmissão" ou "Note Frente".');
  for (;;) {
    const nome = await perguntar(rl, 'Nome desta máquina', padrao);
    if (slugificar(nome)) return nome;
    console.log('Digite um nome com letras ou números.');
  }
}

/** Com Hyper-V ou VPN a máquina tem vários IPs; o certo é o da rede do hub. */
async function escolherHost(rl: Interface, hubUrl: string): Promise<string> {
  const ips = ipsLocais();
  if (ips.length === 0) {
    throw new Error('esta máquina está sem endereço de rede. Conecte-a à rede da igreja.');
  }
  const prefixoHub = new URL(hubUrl).hostname.split('.').slice(0, 3).join('.');
  const mesmaRede = ips.filter((ip) => ip.startsWith(`${prefixoHub}.`));
  const lista = mesmaRede.length > 0 ? mesmaRede : ips;
  const primeiro = lista[0] as string;
  if (lista.length === 1) return primeiro;

  console.log('\nEsta máquina tem mais de um endereço de rede:');
  lista.forEach((ip, indice) => console.log(`   ${indice + 1}) ${ip}`));
  const escolha = await perguntar(rl, 'Qual é o da rede da igreja? (número)', '1');
  return lista[Number(escolha) - 1] ?? primeiro;
}

async function detectarNdi(): Promise<number[]> {
  const encontradas: number[] = [];
  for (const porta of PORTAS_PADRAO.ndiMonitor) {
    try {
      const resposta = await fetch(`http://${LOCAL}:${porta}/v1/sources`, {
        signal: AbortSignal.timeout(800),
      });
      if (resposta.ok) encontradas.push(porta);
    } catch {
      // porta fechada: essa janela do Studio Monitor não existe ou está sem Web Control
    }
  }
  return encontradas;
}

async function configurarNdi(rl: Interface): Promise<ServicoNdi | undefined> {
  titulo('3 de 6 — NDI Studio Monitor');
  console.log('O Studio Monitor mostra nesta máquina (e no datashow) a imagem que vem de outra.');
  if (!(await confirmar(rl, 'Esta máquina exibe imagem pelo NDI Studio Monitor?', false))) {
    return undefined;
  }

  console.log('\nPara o Maestro trocar a fonte pelo celular, ele precisa do controle pela rede:');
  passos([
    '1. Abra o NDI Studio Monitor.',
    '2. Clique com o botão direito na janela (ou no ícone de engrenagem).',
    '3. Marque "Allow Web Control".',
    '4. Se houver mais de uma janela aberta, repita em cada uma.',
  ]);

  for (;;) {
    await perguntar(rl, 'Pronto? Enter para eu procurar as janelas');
    const portas = await detectarNdi();
    if (portas.length > 0) {
      ok(`Achei ${portas.length} janela(s) do Studio Monitor, na(s) porta(s) ${portas.join(', ')}.`);
      if (await confirmar(rl, 'Uso essas?')) return { portas };
    } else {
      aviso('Não achei nenhuma janela com o controle pela rede ligado.');
    }
    if (!(await confirmar(rl, 'Quer tentar de novo?'))) {
      const manual = await perguntar(rl, 'Portas separadas por vírgula (Enter para pular o NDI)');
      const portasManuais = manual
        .split(',')
        .map((parte) => Number(parte.trim()))
        .filter((porta) => Number.isInteger(porta) && porta > 0);
      return portasManuais.length > 0 ? { portas: portasManuais } : undefined;
    }
  }
}

async function testarHolyrics(
  porta: number,
  token: string,
): Promise<{ ok: boolean; mensagem: string }> {
  if (!token) return { ok: false, mensagem: 'Token vazio.' };
  const url = `http://${LOCAL}:${porta}/api/GetCurrentPresentation?token=${encodeURIComponent(token)}`;
  try {
    const resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(2500),
    });
    const dados = (await resposta.json().catch(() => undefined)) as
      | { status?: string; error?: string }
      | undefined;
    if (dados?.status === 'ok') return { ok: true, mensagem: '' };

    const erro = (dados?.error ?? '').toLowerCase();
    if (erro.includes('token')) {
      return { ok: false, mensagem: 'O Holyrics recusou o token. Confira se copiou inteiro, sem espaços.' };
    }
    if (erro.includes('permiss')) {
      return { ok: false, mensagem: 'Falta marcar as permissões do token (passo 4 acima).' };
    }
    return { ok: false, mensagem: `O Holyrics respondeu: ${dados?.error ?? 'resposta inesperada'}.` };
  } catch {
    return {
      ok: false,
      mensagem: `Não consegui falar com o Holyrics na porta ${porta}. Ele está aberto e com o API Server ativado?`,
    };
  }
}

async function perguntarLegenda(rl: Interface): Promise<string | undefined> {
  console.log('\nA legenda da transmissão sai de uma página que o OBS abre como fonte de navegador.');
  if (!(await confirmar(rl, 'É esta máquina que gera a legenda?', false))) return undefined;

  for (;;) {
    const url = await perguntar(rl, 'URL da legenda (Enter para pular)');
    if (!url) return undefined;
    try {
      new URL(url);
    } catch {
      console.log('URL inválida — ela começa com http://');
      continue;
    }
    try {
      const resposta = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (resposta.ok) {
        ok('A página da legenda respondeu.');
        return url;
      }
      aviso(`A página respondeu ${resposta.status}.`);
    } catch {
      aviso('Não consegui abrir essa URL desta máquina.');
    }
    if (await confirmar(rl, 'Usar essa URL mesmo assim?', false)) return url;
    if (!(await confirmar(rl, 'Tentar outra?'))) return undefined;
  }
}

async function configurarHolyrics(rl: Interface): Promise<ServicoHolyrics | undefined> {
  titulo('4 de 6 — Holyrics');
  if (!(await confirmar(rl, 'Esta máquina roda o Holyrics?', false))) return undefined;

  console.log('\nO Maestro passa slide e liga a projeção pelo API Server do Holyrics:');
  passos([
    '1. No Holyrics: menu Arquivo › Configurações › API Server.',
    '2. Ative o servidor (a porta padrão é 8091).',
    '3. Clique em "gerenciar permissões" e crie um token chamado "maestro".',
    '4. Na coluna Local, marque: GetCurrentPresentation, ActionNext, ActionPrevious,',
    '   ActionGoToIndex, CloseCurrentPresentation, ShowQuickPresentation, SetF8, SetF9, SetF10.',
    '5. Copie o token gerado.',
  ]);

  const porta = await perguntarPorta(rl, 'Porta do API Server', PORTAS_PADRAO.holyricsApi);
  for (;;) {
    const token = await perguntar(rl, 'Cole o token do Holyrics');
    const resultado = await testarHolyrics(porta, token);
    if (resultado.ok) {
      ok('O Holyrics respondeu certo.');
      const legendaUrl = await perguntarLegenda(rl);
      return { porta, token, ...(legendaUrl ? { legendaUrl } : {}) };
    }
    aviso(resultado.mensagem);
    if (!(await confirmar(rl, 'Quer tentar de novo?'))) {
      if (token && (await confirmar(rl, 'Salvar assim mesmo e ajustar depois?', false))) {
        return { porta, token };
      }
      return undefined;
    }
  }
}

async function configurarObs(rl: Interface): Promise<ServicoObs | undefined> {
  titulo('5 de 6 — OBS');
  if (!(await confirmar(rl, 'Esta máquina roda o OBS (a transmissão)?', false))) return undefined;

  console.log('\nO Maestro conversa com o OBS pelo WebSocket dele:');
  passos([
    '1. No OBS: menu Ferramentas › Configurações do Servidor WebSocket.',
    '2. Marque "Ativar Servidor WebSocket" (a porta padrão é 4455).',
    '3. Se quiser senha, defina e tenha ela à mão.',
  ]);

  const porta = await perguntarPorta(rl, 'Porta do WebSocket', PORTAS_PADRAO.obsWebsocket);
  if (await portaAberta(LOCAL, porta)) {
    ok('A porta do OBS respondeu.');
  } else {
    aviso('Essa porta não respondeu. Confira se o OBS está aberto e com o servidor ativado.');
  }

  const senha = await perguntar(rl, 'Senha do WebSocket (Enter se não tiver)');
  console.log('\nO teste de legendas precisa saber qual fonte do OBS mostra a letra.');
  const sourceLegenda = await perguntar(rl, 'Nome exato dessa fonte (Enter para pular)');

  return {
    porta,
    ...(senha ? { senha } : {}),
    ...(sourceLegenda ? { sourceLegenda } : {}),
  };
}

/**
 * O agente abre os programas pelo painel, e para isso precisa saber onde eles
 * estão. Ele procura sozinho nos lugares de sempre; o que não achar é
 * perguntado aqui, uma vez só.
 */
async function configurarCaminhos(
  rl: Interface,
  jaInformados: Record<string, string>,
): Promise<Record<string, string>> {
  titulo('6 de 6 — Onde estão os programas');
  console.log('Procurando os programas instalados nesta máquina…');

  const detectados = await detectarCaminhos(true);
  const informados: Record<string, string> = { ...jaInformados };

  for (const app of APLICATIVOS) {
    const nome = NOMES_APLICATIVOS[app];
    const achado = informados[app] ?? detectados[app] ?? null;
    if (achado) {
      ok(`${nome}: ${achado}`);
      continue;
    }
    aviso(`${nome}: não encontrei.`);
    console.log('   Se esta máquina usa esse programa, cole o caminho do .exe (Enter para pular).');
    const caminho = await perguntar(rl, `   Caminho do ${nome}`);
    if (caminho) informados[app] = caminho;
  }

  return informados;
}

async function parear(
  rl: Interface,
  hubUrl: string,
  pedido: Omit<PedidoPareamento, 'pin'>,
): Promise<RespostaPareamento> {
  titulo('Pareando com o hub');
  console.log('O PIN é o mesmo que a equipe usa para abrir o painel.');

  for (;;) {
    const pin = await perguntar(rl, 'PIN do hub');
    const resposta = await fetch(new URL(ROTAS.pareamento, hubUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...pedido, pin }),
    });

    if (resposta.ok) {
      return respostaPareamentoSchema.parse(await resposta.json());
    }
    if (resposta.status === 401) {
      aviso('PIN incorreto.');
      continue;
    }
    const corpo = (await resposta.json().catch(() => undefined)) as { mensagem?: string } | undefined;
    throw new Error(
      `o hub recusou o pareamento (${resposta.status}): ${corpo?.mensagem ?? 'sem detalhes'}`,
    );
  }
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      'o assistente precisa de um terminal para conversar com você. Abra o PowerShell (ou o terminal do Linux), entre na pasta do Maestro e rode "npm run setup".',
    );
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nAssistente de configuração do Maestro');
    console.log('Ele acha o hub, pergunta o que esta máquina faz e cadastra tudo sozinho.');
    console.log('Enter aceita o valor entre colchetes. Ctrl+C sai sem salvar nada.');

    const atual = await carregarConfigSeExistir();
    if (atual) {
      aviso(`\nEsta máquina já está configurada como "${atual.dispositivoId}".`);
      if (!(await confirmar(rl, 'Quer refazer a configuração?'))) return;
    }

    const hubUrl = await escolherHub(rl);
    const nome = await escolherNome(rl, atual?.dispositivoId ?? hostname());
    const host = await escolherHost(rl, hubUrl);
    const ndiMonitor = await configurarNdi(rl);
    const holyrics = await configurarHolyrics(rl);
    const obs = await configurarObs(rl);
    const caminhosApps = await configurarCaminhos(rl, atual?.caminhosApps ?? {});

    const porta = atual?.porta ?? PORTAS_PADRAO.agente;
    const resposta = await parear(rl, hubUrl, {
      nome,
      host,
      porta,
      ...(atual?.dispositivoId ? { dispositivoIdAnterior: atual.dispositivoId } : {}),
      servicos: {
        ...(holyrics ? { holyrics } : {}),
        ...(ndiMonitor ? { ndiMonitor } : {}),
        ...(obs ? { obs } : {}),
      },
    });

    await salvarConfig({
      dispositivoId: resposta.dispositivoId,
      hubUrl,
      porta,
      token: resposta.token,
      intervaloHeartbeatMs: atual?.intervaloHeartbeatMs ?? 10_000,
      caminhosApps,
    });

    titulo('Pronto!');
    console.log(`Esta máquina entrou no painel como "${resposta.nome}".`);
    console.log(`Configuração salva em ${CAMINHO_CONFIG}`);
    console.log('\nPara o agente subir agora:');
    passos([
      platform() === 'win32'
        ? 'Start-ScheduledTask -TaskName maestro-agent'
        : 'systemctl --user restart maestro-agent',
    ]);
    console.log('\nEm poucos segundos esta máquina fica verde no painel.');
  } finally {
    rl.close();
  }
}

main().catch((erro: unknown) => {
  console.error(`\n\x1b[31m[setup] ${erro instanceof Error ? erro.message : String(erro)}\x1b[0m`);
  process.exit(1);
});
