import {
  ESPERA_PRONTO_PADRAO_S,
  NOMES_APLICATIVOS,
  type AcaoApp,
  type Aplicativo,
  type ComandoAviso,
  type ExecucaoAoLigar,
  type PassoAoLigar,
} from '@maestro/shared';

/** O que cada passo precisa da máquina; os testes trocam por versões de mentira. */
export interface DependenciasRotina {
  acaoApp(app: Aplicativo, acao: AcaoApp): Promise<void>;
  aviso(comando: ComandoAviso): Promise<void>;
  ndi(porta: number, fonte: string | null): Promise<void>;
  /** Abre o endereço no Chrome (ou no navegador padrão, se esta máquina não tiver Chrome). */
  abrirPagina(url: string): Promise<void>;
  /** Chama a API do Holyrics desta máquina; falha se ele não está aberto ou o token não é conhecido. */
  holyrics(acao: string, corpo?: Record<string, unknown>): Promise<void>;
  /** O programa já está pronto (Holyrics: a API responde; os outros: a janela apareceu)? */
  appPronto(app: Aplicativo): Promise<boolean>;
  dormir(ms: number): Promise<void>;
  agora(): number;
}

const VERBOS_APP: Record<AcaoApp, string> = {
  abrir: 'Abrir',
  fechar: 'Fechar',
  reiniciar: 'Reiniciar',
  frente: 'Trazer para frente',
};

const INTERVALO_PRONTO_MS = 1000;

/** "Esperar ficar pronto" só faz sentido quando o passo abre o programa. */
function esperaPronto(passo: Extract<PassoAoLigar, { tipo: 'app.acao' }>): boolean {
  return passo.esperarPronto === true && (passo.acao === 'abrir' || passo.acao === 'reiniciar');
}

function formatarEspera(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const segundos = ms / 1000;
  if (segundos < 60 || segundos % 60 !== 0) return `${segundos.toLocaleString('pt-BR')} s`;
  return `${segundos / 60} min`;
}

export function descreverPasso(passo: PassoAoLigar): string {
  switch (passo.tipo) {
    case 'app.acao':
      return `${VERBOS_APP[passo.acao]} o ${NOMES_APLICATIVOS[passo.app]}${esperaPronto(passo) ? ' e esperar ficar pronto' : ''}`;
    case 'aviso':
      return `Aviso "${passo.mensagem}"${passo.segundos ? ` (some em ${passo.segundos} s)` : ''}`;
    case 'ndi.definirFonte':
      return `NDI (janela ${passo.porta}) → ${passo.fonte ?? 'Nenhuma'}`;
    case 'chrome.abrir':
      return `Abrir no Chrome: ${passo.url}`;
    case 'holyrics.f8':
      return `Holyrics → plano de fundo ${passo.ativar ? 'ligado' : 'desligado'}`;
    case 'holyrics.encerrarApresentacao':
      return 'Holyrics → fechar apresentação';
    case 'espera':
      return `Esperar ${formatarEspera(passo.ms)}`;
  }
}

async function esperarFicarPronto(deps: DependenciasRotina, app: Aplicativo, maxSegundos: number): Promise<void> {
  const limite = deps.agora() + maxSegundos * 1000;
  for (;;) {
    try {
      if (await deps.appPronto(app)) return;
    } catch {
      // ainda abrindo: tenta de novo até o limite
    }
    if (deps.agora() + INTERVALO_PRONTO_MS > limite) break;
    await deps.dormir(INTERVALO_PRONTO_MS);
  }
  throw new Error(`o ${NOMES_APLICATIVOS[app]} não ficou pronto em ${maxSegundos} s`);
}

async function executarPasso(passo: PassoAoLigar, deps: DependenciasRotina): Promise<void> {
  switch (passo.tipo) {
    case 'app.acao':
      await deps.acaoApp(passo.app, passo.acao);
      if (esperaPronto(passo)) await esperarFicarPronto(deps, passo.app, passo.esperaMaxSegundos ?? ESPERA_PRONTO_PADRAO_S);
      return;
    case 'aviso':
      await deps.aviso({
        mensagem: passo.mensagem,
        ...(passo.monitor !== undefined ? { monitor: passo.monitor } : {}),
        segundos: passo.segundos,
      });
      return;
    case 'ndi.definirFonte':
      await deps.ndi(passo.porta, passo.fonte);
      return;
    case 'chrome.abrir':
      await deps.abrirPagina(passo.url);
      return;
    case 'holyrics.f8':
      await deps.holyrics('SetF8', { enable: passo.ativar });
      return;
    case 'holyrics.encerrarApresentacao':
      await deps.holyrics('CloseCurrentPresentation');
      return;
    case 'espera':
      await deps.dormir(passo.ms);
      return;
  }
}

/**
 * Roda os passos em ordem. Um passo que falha não interrompe os outros: é
 * melhor o NDI trocar mesmo que o Holyrics não tenha aberto. A exceção é o
 * "esperar ficar pronto" que estourou: quem marcou disse que o resto depende
 * do programa, então o resto não roda.
 */
export async function executarPassos(
  passos: PassoAoLigar[],
  deps: DependenciasRotina,
  origem: ExecucaoAoLigar['origem'],
): Promise<ExecucaoAoLigar> {
  const resultado: ExecucaoAoLigar['passos'] = [];
  let interrompidoPor: string | null = null;
  for (const passo of passos) {
    const descricao = descreverPasso(passo);
    if (interrompidoPor) {
      resultado.push({ descricao, ok: false, pulado: true, erro: `não rodou: ${interrompidoPor}` });
      continue;
    }
    try {
      await executarPasso(passo, deps);
      resultado.push({ descricao, ok: true });
    } catch (erro) {
      resultado.push({ descricao, ok: false, erro: erro instanceof Error ? erro.message : 'erro desconhecido' });
      if (passo.tipo === 'app.acao' && esperaPronto(passo)) {
        interrompidoPor = `o ${NOMES_APLICATIVOS[passo.app]} não abriu`;
      }
    }
  }
  return { ts: deps.agora(), origem, ok: resultado.every((p) => p.ok), passos: resultado };
}
