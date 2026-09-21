import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  APLICATIVOS,
  NOMES_APLICATIVOS,
  PROCESSOS_POR_APLICATIVO,
  type AcaoApp,
  type Aplicativo,
  type ConfigAgente,
  type SituacaoApp,
} from '@maestro/shared';
import { listarProcessos } from '../processos.js';

const execFileAsync = promisify(execFile);

const TIMEOUT_MS = 25_000;
/** Programa instalado não muda de lugar no meio do culto. */
const CACHE_CAMINHOS_MS = 10 * 60_000;
const ESPERA_FECHAR_MS = 1500;

/** Erro com mensagem pronta para a tela de quem está operando. */
export class ErroApp extends Error {
  constructor(
    override readonly message: string,
    readonly causaTecnica?: string,
  ) {
    super(message);
    this.name = 'ErroApp';
  }
}

function localizarScript(): string {
  // Roda de src/apps em desenvolvimento e de dist/apps depois do build, que
  // copia o .ps1 para o lado do JavaScript.
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [join(aqui, 'acoes.ps1'), join(aqui, '..', '..', 'src', 'apps', 'acoes.ps1')];
  const encontrado = candidatos.find((caminho) => existsSync(caminho));
  if (!encontrado) {
    throw new ErroApp(
      'O script de controle de aplicativos não foi encontrado na instalação do agente.',
      `procurado em: ${candidatos.join(', ')}`,
    );
  }
  return encontrado;
}

interface RespostaPs {
  ok?: boolean;
  dados?: unknown;
  erro?: string;
}

function mensagemDoErro(bruto: string | undefined, app: Aplicativo): string {
  const nome = NOMES_APLICATIVOS[app];
  if (bruto?.includes('nao-esta-aberto')) return `O ${nome} não está aberto nesta máquina.`;
  if (bruto?.includes('caminho-invalido')) {
    return `Não achei o ${nome} instalado nesta máquina. Rode "npm run setup" nela para informar o caminho.`;
  }
  return `A máquina recusou a ação no ${nome}${bruto ? `: ${bruto}` : '.'}`;
}

async function rodarScript(argumentos: string[], app: Aplicativo): Promise<unknown> {
  if (platform() !== 'win32') {
    throw new ErroApp('Controlar aplicativos só funciona nas máquinas Windows.');
  }

  const script = localizarScript();
  let saida: string;
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...argumentos],
      { timeout: TIMEOUT_MS, windowsHide: true },
    );
    saida = stdout;
  } catch (err) {
    // O script sai com código 1 quando a ação falha, mas o JSON do erro vem no stdout.
    const comSaida = err as { stdout?: string; message?: string };
    saida = comSaida.stdout ?? '';
    if (!saida.trim()) {
      throw new ErroApp(mensagemDoErro(comSaida.message, app), comSaida.message);
    }
  }

  const linha = saida.trim().split(/\r?\n/).pop() ?? '';
  let resposta: RespostaPs;
  try {
    resposta = JSON.parse(linha) as RespostaPs;
  } catch {
    throw new ErroApp(mensagemDoErro(undefined, app), linha.slice(0, 300));
  }
  if (!resposta.ok) throw new ErroApp(mensagemDoErro(resposta.erro, app), resposta.erro);
  return resposta.dados;
}

let cacheCaminhos: { ts: number; dados: Record<string, string | null> } | undefined;

/** Procura os programas nos lugares de sempre. Vazio fora do Windows. */
export async function detectarCaminhos(forcar = false): Promise<Record<string, string | null>> {
  if (!forcar && cacheCaminhos && Date.now() - cacheCaminhos.ts < CACHE_CAMINHOS_MS) {
    return cacheCaminhos.dados;
  }

  let detectados: Record<string, string | null> = {};
  if (platform() === 'win32') {
    try {
      detectados = (await rodarScript(['-Acao', 'localizar'], 'obs')) as Record<string, string | null>;
    } catch {
      // Sem detecção o painel ainda mostra o que está aberto; só o botão de
      // abrir fica indisponível até alguém informar o caminho.
      detectados = {};
    }
  }

  cacheCaminhos = { ts: Date.now(), dados: detectados };
  return detectados;
}

/**
 * Onde cada programa está instalado. O que o agente acha sozinho vale primeiro;
 * o que a pessoa informou no assistente entra por cima — é o caso de quem
 * instalou o Holyrics fora do lugar de sempre.
 */
export async function caminhosDosApps(
  config: ConfigAgente,
  forcar = false,
): Promise<Record<string, string | null>> {
  return { ...(await detectarCaminhos(forcar)), ...config.caminhosApps };
}

export async function situacaoDosApps(config: ConfigAgente): Promise<SituacaoApp[]> {
  const [abertos, caminhos] = await Promise.all([listarProcessos(), caminhosDosApps(config)]);
  return APLICATIVOS.map((app) => ({
    app,
    aberto: abertos[app] ?? false,
    caminho: caminhos[app] ?? null,
  }));
}

function processosDe(app: Aplicativo): string {
  return PROCESSOS_POR_APLICATIVO[app].join(',');
}

async function abrir(app: Aplicativo, config: ConfigAgente): Promise<void> {
  const caminhos = await caminhosDosApps(config);
  const caminho = caminhos[app];
  if (!caminho) {
    throw new ErroApp(
      `Não sei onde o ${NOMES_APLICATIVOS[app]} está instalado nesta máquina. Rode "npm run setup" nela para informar o caminho.`,
    );
  }
  await rodarScript(['-Acao', 'abrir', '-Caminho', caminho], app);
}

/**
 * Traz o programa para frente e manda a seta. O convidado escolhe o programa na
 * tela do celular, então a tecla nunca depende de quem clicou por último na
 * máquina.
 */
export async function enviarTecla(app: Aplicativo, direcao: 'proximo' | 'anterior'): Promise<void> {
  const tecla = direcao === 'proximo' ? 'RIGHT' : 'LEFT';
  await rodarScript(['-Acao', 'tecla', '-Processos', processosDe(app), '-Tecla', tecla], app);
}

export async function executarAcaoApp(
  app: Aplicativo,
  acao: AcaoApp,
  config: ConfigAgente,
): Promise<void> {
  switch (acao) {
    case 'abrir':
      await abrir(app, config);
      return;
    case 'fechar':
      await rodarScript(['-Acao', 'fechar', '-Processos', processosDe(app)], app);
      return;
    case 'frente':
      await rodarScript(['-Acao', 'frente', '-Processos', processosDe(app)], app);
      return;
    case 'reiniciar':
      // Fechar é um "clicar no X": o programa pode demorar a sair, e pode até
      // perguntar se quer salvar. Por isso espera antes de abrir de novo.
      await rodarScript(['-Acao', 'fechar', '-Processos', processosDe(app)], app).catch(() => {
        // já estava fechado: seguir direto para abrir
      });
      await new Promise((resolver) => setTimeout(resolver, ESPERA_FECHAR_MS));
      await abrir(app, config);
      return;
  }
}
