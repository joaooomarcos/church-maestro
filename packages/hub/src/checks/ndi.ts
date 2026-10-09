import {
  consolidarStatus,
  dispositivoDaFonteNdi,
  type CapturaMonitor,
  type DispositivoConfig,
  type ImagemCheck,
  type PassoCheck,
  type ResultadoCheck,
} from '@maestro/shared';
import { ErroDriver } from '../drivers/tipos.js';
import { compararAmostras, decodificarAmostra } from './imagem.js';
import type { ContextoCheck } from './tipos.js';

/**
 * Confere o caminho do NDI em dois passos por janela do Studio Monitor:
 *
 *  1. a janela está online e exibe uma fonte que existe de verdade na rede;
 *  2. prova real por imagem: o monitor que a máquina de ORIGEM envia pelo NDI
 *     Screen Capture é parecido com o monitor onde a janela aparece no DESTINO.
 *
 * O erro clássico do passo 1 é silencioso: a janela continua com o nome da fonte
 * selecionado, mas a máquina que enviava foi desligada — o operador só descobre
 * quando o datashow fica preto no meio do louvor. O passo 2 pega o resto: fonte
 * errada, janela escondida atrás de outra, tela da origem bloqueada.
 *
 * O teste só tira prints; não exibe nada no telão.
 */

/** Quanto esperar a resposta do agente antes de dar a máquina por desligada. */
const TIMEOUT_AGENTE_MS = 2500;

interface Tela {
  dispositivo: DispositivoConfig;
  /** id do monitor; null = o principal. */
  monitor: string | null;
}

type ResultadoCaptura = { captura: CapturaMonitor } | { erro: string; semAgente: boolean };

/** "\\.\DISPLAY2" vira "tela 2". */
function nomeDaTela(monitor: string | null): string {
  const numero = monitor ? /DISPLAY(\d+)/i.exec(monitor)?.[1] : undefined;
  if (numero) return `tela ${numero}`;
  return monitor ?? 'tela principal';
}

function dataUrl(captura: CapturaMonitor): string {
  return `data:${captura.tipoMiniatura};base64,${captura.miniatura}`;
}

export async function checarNdi(ctx: ContextoCheck): Promise<ResultadoCheck> {
  const passos: PassoCheck[] = [];
  const dispositivos = ctx.dispositivos();
  const comMonitor = dispositivos.filter((d) => d.servicos.ndiMonitor && d.host);
  const hostname = (id: string): string | undefined => ctx.hostname?.(id);

  if (comMonitor.length === 0) {
    passos.push({
      id: 'sem-monitor',
      titulo: 'Studio Monitor configurado',
      status: 'falha',
      detalhe: 'Nenhuma máquina tem o NDI Studio Monitor configurado.',
      comoResolver:
        'Rode o assistente de instalação do Maestro no PC que recebe a imagem e informe as portas do Studio Monitor (a 1ª janela usa a porta 80).',
    });
    return montar(passos, ctx);
  }

  // O mesmo monitor é capturado uma vez só, mesmo que duas janelas dependam dele.
  const capturas = new Map<string, Promise<ResultadoCaptura>>();
  const agentes = new Map<string, Promise<string | null>>();

  /** null = o agente respondeu; texto = por que não deu. */
  function agenteDisponivel(dispositivo: DispositivoConfig): Promise<string | null> {
    let busca = agentes.get(dispositivo.id);
    if (!busca) {
      busca = (async () => {
        if (!dispositivo.servicos.agente || !dispositivo.host) {
          return 'a máquina não tem o agente do Maestro instalado';
        }
        const estado = await ctx.drivers.agente.ler(dispositivo, { timeoutMs: TIMEOUT_AGENTE_MS });
        return estado.online ? null : (estado.erro ?? 'o agente não respondeu');
      })();
      agentes.set(dispositivo.id, busca);
    }
    return busca;
  }

  function capturar({ dispositivo, monitor }: Tela): Promise<ResultadoCaptura> {
    const chave = `${dispositivo.id}|${monitor ?? ''}`;
    let busca = capturas.get(chave);
    if (!busca) {
      busca = (async (): Promise<ResultadoCaptura> => {
        const indisponivel = await agenteDisponivel(dispositivo);
        if (indisponivel) {
          return { erro: indisponivel, semAgente: !dispositivo.servicos.agente };
        }
        try {
          return { captura: await ctx.drivers.agente.capturarMonitor(dispositivo, monitor) };
        } catch (erro) {
          return { erro: erro instanceof ErroDriver ? erro.message : String(erro), semAgente: false };
        }
      })();
      capturas.set(chave, busca);
    }
    return busca;
  }

  const fontesVistas = new Set<string>();

  for (const dispositivo of comMonitor) {
    const portas = dispositivo.servicos.ndiMonitor?.portas ?? [80];

    for (const porta of portas) {
      const base = { grupo: dispositivo.nome } as const;
      const idPasso = `monitor-${dispositivo.id}-${porta}`;
      const titulo = `Janela ${porta}`;

      const estado = await ctx.drivers.ndi.ler(dispositivo.host, porta, { timeoutMs: 3000 });

      if (!estado.online) {
        passos.push({
          ...base,
          id: idPasso,
          titulo: `${titulo} — Studio Monitor`,
          status: 'falha',
          detalhe: estado.erro ?? 'Não respondeu.',
          comoResolver: `No ${dispositivo.nome}, abra o NDI Studio Monitor e marque "Allow Web Control" nas configurações. Confira também se a porta ${porta} está liberada no Firewall.`,
        });
        continue;
      }

      for (const fonte of estado.fontesDisponiveis) fontesVistas.add(fonte);

      if (estado.fonteAtual === null) {
        passos.push({
          ...base,
          id: idPasso,
          titulo: `${titulo} — fonte`,
          status: 'aviso',
          detalhe: 'A janela está sem nenhuma fonte selecionada.',
          comoResolver: 'Escolha a fonte no menu NDI do painel.',
        });
        continue;
      }

      const fonteExiste = estado.fontesDisponiveis.includes(estado.fonteAtual);
      passos.push({
        ...base,
        id: idPasso,
        titulo: `${titulo} — fonte`,
        status: fonteExiste ? 'ok' : 'falha',
        detalhe: fonteExiste
          ? `Exibindo "${estado.fonteAtual}".`
          : `Está selecionada a fonte "${estado.fonteAtual}", mas ela não está mais na rede. A tela deve estar preta.`,
        comoResolver: fonteExiste
          ? undefined
          : 'Ligue a máquina que envia essa imagem e confira se o NDI Screen Capture está rodando nela; ou escolha outra fonte no menu NDI.',
      });
      if (!fonteExiste) continue;

      // --- Passo 2: prova real por imagem --------------------------------
      const idImagem = `imagem-${dispositivo.id}-${porta}`;
      const tituloImagem = `${titulo} — imagem`;
      const monitorDestino = dispositivo.servicos.ndiMonitor?.monitores?.[String(porta)];

      if (!monitorDestino) {
        passos.push({
          ...base,
          id: idImagem,
          titulo: tituloImagem,
          status: 'aviso',
          detalhe: `Não sei em que monitor do ${dispositivo.nome} esta janela aparece; só conferi a fonte.`,
          comoResolver: 'Informe em Ajustes › NDI o monitor desta janela.',
        });
        continue;
      }

      const origem = dispositivoDaFonteNdi(estado.fonteAtual, dispositivos, hostname);
      const destino: Tela = { dispositivo, monitor: monitorDestino };

      if (!origem) {
        const unico = await capturar(destino);
        if ('erro' in unico) {
          passos.push(falhaDeCaptura(base, idImagem, tituloImagem, dispositivo, unico));
          continue;
        }
        passos.push({
          ...base,
          id: idImagem,
          titulo: tituloImagem,
          status: 'aviso',
          detalhe: `A fonte "${estado.fonteAtual}" não é uma máquina do painel, então não há com o que comparar. Veja se o print da janela é o que deveria aparecer.`,
          comoResolver: 'Se essa máquina deveria estar no painel, rode o assistente de instalação nela.',
          imagens: [
            { rotulo: `Janela · ${dispositivo.nome} (${nomeDaTela(monitorDestino)})`, dataUrl: dataUrl(unico.captura) },
          ],
        });
        continue;
      }

      const telaOrigem: Tela = { dispositivo: origem, monitor: origem.monitorNdiEnvio ?? null };
      const [resOrigem, resDestino] = await Promise.all([capturar(telaOrigem), capturar(destino)]);

      // Se as duas falharem, a do destino vem primeiro: é a janela que está sendo testada.
      if ('erro' in resDestino) {
        passos.push(falhaDeCaptura(base, idImagem, tituloImagem, dispositivo, resDestino));
        continue;
      }
      if ('erro' in resOrigem) {
        passos.push(falhaDeCaptura(base, idImagem, tituloImagem, origem, resOrigem));
        continue;
      }

      const imagens: ImagemCheck[] = [
        { rotulo: `Origem · ${origem.nome} (${nomeDaTela(resOrigem.captura.monitor)})`, dataUrl: dataUrl(resOrigem.captura) },
        { rotulo: `Destino · ${dispositivo.nome} (${nomeDaTela(resDestino.captura.monitor)})`, dataUrl: dataUrl(resDestino.captura) },
      ];

      const amostraOrigem = decodificarAmostra(resOrigem.captura.amostra);
      const amostraDestino = decodificarAmostra(resDestino.captura.amostra);
      if (!amostraOrigem || !amostraDestino) {
        passos.push({
          ...base,
          id: idImagem,
          titulo: tituloImagem,
          status: 'aviso',
          detalhe: 'Os prints chegaram, mas a amostra para comparar veio com tamanho inesperado.',
          comoResolver: 'Atualize o agente das duas máquinas (Sistema › Versões) e teste de novo.',
          imagens,
        });
        continue;
      }

      const comparacao = compararAmostras(amostraOrigem, amostraDestino);

      if (comparacao.veredito === 'inconclusiva') {
        const quem =
          comparacao.lisa === 'origem'
            ? `do ${origem.nome}`
            : comparacao.lisa === 'destino'
              ? `do ${dispositivo.nome}`
              : `do ${origem.nome} e do ${dispositivo.nome}`;
        passos.push({
          ...base,
          id: idImagem,
          titulo: tituloImagem,
          status: 'aviso',
          detalhe: `Não deu para comparar: a imagem ${quem} está lisa (preta ou apagada).`,
          comoResolver: 'A tela pode estar bloqueada ou apagada. Acorde e desbloqueie a máquina e teste de novo.',
          imagens,
        });
      } else if (comparacao.veredito === 'diferentes') {
        passos.push({
          ...base,
          id: idImagem,
          titulo: tituloImagem,
          status: 'falha',
          detalhe: `A janela do ${dispositivo.nome} não está mostrando o ${origem.nome}: as duas telas são muito diferentes.`,
          comoResolver: `Confira se a janela do Studio Monitor está na frente, no monitor certo (${nomeDaTela(monitorDestino)}) e sem estar minimizada. No ${origem.nome}, veja se o NDI Screen Capture envia o monitor que a equipe espera (Ajustes › NDI).`,
          imagens,
        });
      } else {
        passos.push({
          ...base,
          id: idImagem,
          titulo: tituloImagem,
          status: 'ok',
          detalhe: `A janela do ${dispositivo.nome} está mostrando o ${origem.nome}.`,
          imagens,
        });
      }
    }
  }

  // Quem tem agente e deveria estar enviando a tela precisa aparecer entre as
  // fontes vistas pelas janelas.
  const jaVistas = [...fontesVistas];
  for (const dispositivo of dispositivos) {
    if (!dispositivo.host || !dispositivo.servicos.agente) continue;
    const envia = jaVistas.some((f) => dispositivoDaFonteNdi(f, [dispositivo], hostname));
    if (!envia && jaVistas.length > 0) {
      passos.push({
        id: `envio-${dispositivo.id}`,
        titulo: `Envio de tela — ${dispositivo.nome}`,
        status: 'aviso',
        detalhe: `Nenhuma fonte NDI do ${dispositivo.nome} apareceu na rede.`,
        comoResolver: `Se o ${dispositivo.nome} precisa enviar a tela, abra o NDI Screen Capture nele.`,
      });
    }
  }

  return montar(passos, ctx);
}

function falhaDeCaptura(
  base: { readonly grupo: string },
  id: string,
  titulo: string,
  maquina: DispositivoConfig,
  resultado: { erro: string; semAgente: boolean },
): PassoCheck {
  return {
    ...base,
    id,
    titulo,
    status: 'falha',
    detalhe: `Não consegui ver a tela do ${maquina.nome}: ${resultado.erro}`,
    comoResolver: resultado.semAgente
      ? `Rode o assistente de instalação do Maestro no ${maquina.nome} para instalar o agente.`
      : `Ligue o ${maquina.nome} e confira se o Maestro (o agente) está aberto nele.`,
  };
}

function montar(passos: PassoCheck[], ctx: ContextoCheck): ResultadoCheck {
  const status = consolidarStatus(passos);
  const falha = passos.find((p) => p.status === 'falha');
  const aviso = passos.find((p) => p.status === 'aviso');
  const destaque = falha ?? aviso;
  const resultado: ResultadoCheck = {
    id: 'ndi',
    titulo: 'Teste do NDI',
    ts: Date.now(),
    status,
    resumo:
      status === 'ok'
        ? 'Todas as janelas estão mostrando a imagem das máquinas de origem.'
        : destaque
          ? `${destaque.grupo ? `${destaque.grupo}, ${destaque.titulo.split(' — ')[0]?.toLowerCase()}: ` : ''}${destaque.detalhe}`
          : 'Teste inconclusivo.',
    passos,
  };
  ctx.publicar?.(resultado);
  return resultado;
}
