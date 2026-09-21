import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ComandoPpt, StatusPpt } from '@maestro/shared';
import { ErroPowerPoint, PPT_INDISPONIVEL, type PontePowerPoint } from './tipos.js';

/**
 * Fala com o PowerPoint por COM, através de um processo PowerShell persistente
 * (ver ponte.ps1). O processo fica vivo entre os comandos porque abrir um
 * powershell.exe por slide custaria uns 300ms — perceptível para quem está
 * passando a letra da música no tempo da banda.
 *
 * Precisa rodar na sessão do usuário logado: como serviço do sistema, o COM não
 * enxerga o PowerPoint aberto na área de trabalho.
 */

const TIMEOUT_COMANDO_MS = 5000;
/** Evita ficar reabrindo o PowerShell em looping se algo estiver errado. */
const ESPERA_REINICIO_MS = 3000;

interface Pendente {
  resolver(dados: unknown): void;
  rejeitar(err: Error): void;
  temporizador: NodeJS.Timeout;
}

interface RespostaPonte {
  id?: number;
  ok?: boolean;
  dados?: unknown;
  codigo?: string;
  erro?: string;
  pronto?: boolean;
}

/** Traduz os códigos do script para mensagens que vão direto para a tela. */
function mensagemPara(codigo: string | undefined, bruto: string | undefined): string {
  switch (codigo) {
    case 'sem-powerpoint':
      return 'O PowerPoint não está aberto nesta máquina.';
    case 'sem-apresentacao':
      return 'O PowerPoint está aberto, mas nenhum arquivo foi carregado.';
    case 'fora-de-exibicao':
      return 'A apresentação não está no modo exibição. Inicie a apresentação para poder passar os slides.';
    case 'acao-desconhecida':
      return 'Comando de PowerPoint não reconhecido.';
    default:
      return `O PowerPoint recusou o comando${bruto ? `: ${bruto}` : '.'}`;
  }
}

function localizarScript(): string {
  // Em desenvolvimento roda de src/ppt; compilado, de dist/ppt com o .ps1
  // copiado ao lado pelo passo de build.
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    join(aqui, 'ponte.ps1'),
    join(aqui, '..', '..', 'src', 'ppt', 'ponte.ps1'),
  ];
  const encontrado = candidatos.find((c) => existsSync(c));
  if (!encontrado) {
    throw new ErroPowerPoint(
      'O script de ponte com o PowerPoint não foi encontrado na instalação do agente.',
      `procurado em: ${candidatos.join(', ')}`,
    );
  }
  return encontrado;
}

export function criarPonteWindows(): PontePowerPoint {
  let processo: ChildProcessWithoutNullStreams | null = null;
  let leitor: Interface | null = null;
  let proximoId = 1;
  let encerrando = false;
  let podeReiniciarEm = 0;
  const pendentes = new Map<number, Pendente>();

  function derrubar(motivo: string): void {
    for (const [, pendente] of pendentes) {
      clearTimeout(pendente.temporizador);
      pendente.rejeitar(new ErroPowerPoint('A ponte com o PowerPoint caiu.', motivo));
    }
    pendentes.clear();
    leitor?.close();
    leitor = null;
    processo = null;
  }

  function garantirProcesso(): ChildProcessWithoutNullStreams {
    if (processo && !processo.killed) return processo;
    if (Date.now() < podeReiniciarEm) {
      throw new ErroPowerPoint(
        'A ponte com o PowerPoint não conseguiu iniciar. Tentando de novo em instantes.',
      );
    }

    const script = localizarScript();
    const filho = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        script,
      ],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );

    filho.on('error', (err) => {
      podeReiniciarEm = Date.now() + ESPERA_REINICIO_MS;
      derrubar(err.message);
    });
    filho.on('exit', (codigo) => {
      if (!encerrando) podeReiniciarEm = Date.now() + ESPERA_REINICIO_MS;
      derrubar(`powershell encerrou com código ${codigo}`);
    });
    // Sem consumir stderr, um erro volumoso do PowerShell trava o processo ao
    // encher o buffer do pipe.
    filho.stderr.resume();

    const linhas = createInterface({ input: filho.stdout });
    linhas.on('line', (linha) => {
      let resposta: RespostaPonte;
      try {
        resposta = JSON.parse(linha) as RespostaPonte;
      } catch {
        return;
      }
      if (typeof resposta.id !== 'number') return;
      const pendente = pendentes.get(resposta.id);
      if (!pendente) return;
      pendentes.delete(resposta.id);
      clearTimeout(pendente.temporizador);

      if (resposta.ok) {
        pendente.resolver(resposta.dados);
      } else {
        pendente.rejeitar(
          new ErroPowerPoint(mensagemPara(resposta.codigo, resposta.erro), resposta.erro),
        );
      }
    });

    processo = filho;
    leitor = linhas;
    return filho;
  }

  function enviar(comando: Record<string, unknown>): Promise<unknown> {
    const filho = garantirProcesso();
    const id = proximoId++;

    return new Promise<unknown>((resolver, rejeitar) => {
      const temporizador = setTimeout(() => {
        pendentes.delete(id);
        rejeitar(
          new ErroPowerPoint(
            'O PowerPoint não respondeu a tempo. Ele pode estar com uma janela de diálogo aberta esperando alguém.',
          ),
        );
      }, TIMEOUT_COMANDO_MS);

      pendentes.set(id, { resolver, rejeitar, temporizador });
      filho.stdin.write(`${JSON.stringify({ ...comando, id })}\n`, (err) => {
        if (err) {
          pendentes.delete(id);
          clearTimeout(temporizador);
          rejeitar(new ErroPowerPoint('Não foi possível falar com o PowerPoint.', err.message));
        }
      });
    });
  }

  function normalizar(dados: unknown): StatusPpt {
    if (dados === null || typeof dados !== 'object') return PPT_INDISPONIVEL;
    const d = dados as Record<string, unknown>;
    return {
      emApresentacao: d['emApresentacao'] === true,
      slide: typeof d['slide'] === 'number' ? d['slide'] : null,
      totalSlides: typeof d['totalSlides'] === 'number' ? d['totalSlides'] : null,
      arquivo: typeof d['arquivo'] === 'string' ? d['arquivo'] : null,
    };
  }

  return {
    disponivel: true,

    async status() {
      try {
        return normalizar(await enviar({ acao: 'status' }));
      } catch (err) {
        // Status é lido pelo hub a cada poucos segundos; PowerPoint fechado é
        // situação normal, não erro.
        if (err instanceof ErroPowerPoint && err.message.includes('não está aberto')) {
          return PPT_INDISPONIVEL;
        }
        throw err;
      }
    },

    async executar(comando: ComandoPpt) {
      const carga: Record<string, unknown> = { acao: comando.acao };
      if (comando.acao === 'irPara') carga['slide'] = comando.slide;
      return normalizar(await enviar(carga));
    },

    async janelaEmPrimeiroPlano() {
      try {
        const dados = await enviar({ acao: 'primeiroPlano' });
        if (dados === null || typeof dados !== 'object') return null;
        const d = dados as Record<string, unknown>;
        const processo = typeof d['processo'] === 'string' ? d['processo'].toLowerCase() : '';
        if (!processo) return null;
        return { processo, titulo: typeof d['titulo'] === 'string' ? d['titulo'] : '' };
      } catch {
        // Saber a janela da frente é conforto, não operação: se a ponte estiver
        // ruim, o resto do heartbeat segue valendo.
        return null;
      }
    },

    async encerrar() {
      encerrando = true;
      const filho = processo;
      if (!filho) return;
      filho.stdin.end();
      await new Promise<void>((resolver) => {
        const prazo = setTimeout(() => {
          filho.kill();
          resolver();
        }, 1000);
        filho.once('exit', () => {
          clearTimeout(prazo);
          resolver();
        });
      });
    },
  };
}
