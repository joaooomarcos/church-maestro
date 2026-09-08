import { consolidarStatus, type PassoCheck, type ResultadoCheck } from '@maestro/shared';
import type { ContextoCheck } from './tipos.js';

/**
 * Confere o caminho do NDI: quem deveria estar transmitindo a tela aparece na
 * rede, e cada janela do Studio Monitor está exibindo uma fonte que existe de
 * verdade.
 *
 * O erro clássico aqui é silencioso: a janela continua com o nome da fonte
 * selecionado, mas a máquina que enviava foi desligada — o operador só descobre
 * quando o datashow fica preto no meio do louvor.
 */
export async function checarNdi(ctx: ContextoCheck): Promise<ResultadoCheck> {
  const passos: PassoCheck[] = [];
  const dispositivos = ctx.dispositivos();
  const comMonitor = dispositivos.filter((d) => d.servicos.ndiMonitor && d.host);

  if (comMonitor.length === 0) {
    passos.push({
      id: 'sem-monitor',
      titulo: 'Studio Monitor configurado',
      status: 'falha',
      detalhe: 'Nenhuma máquina tem o NDI Studio Monitor configurado.',
      comoResolver:
        'Em Dispositivos, informe as portas do Studio Monitor das máquinas que recebem imagem (a 1ª janela usa a porta 80).',
    });
    return montar(passos, ctx);
  }

  const fontesVistas = new Set<string>();

  for (const dispositivo of comMonitor) {
    const portas = dispositivo.servicos.ndiMonitor?.portas ?? [80];

    for (const porta of portas) {
      const rotulo =
        portas.length > 1 ? `${dispositivo.nome} (janela ${porta})` : dispositivo.nome;

      const estado = await ctx.drivers.ndi.ler(dispositivo.host, porta, { timeoutMs: 3000 });

      if (!estado.online) {
        passos.push({
          id: `monitor-${dispositivo.id}-${porta}`,
          titulo: `Studio Monitor — ${rotulo}`,
          status: 'falha',
          detalhe: estado.erro ?? 'Não respondeu.',
          comoResolver: `No ${dispositivo.nome}, abra o NDI Studio Monitor e marque "Allow Web Control" nas configurações. Confira também se a porta ${porta} está liberada no Firewall.`,
        });
        continue;
      }

      for (const fonte of estado.fontesDisponiveis) fontesVistas.add(fonte);

      if (estado.fonteAtual === null) {
        passos.push({
          id: `monitor-${dispositivo.id}-${porta}`,
          titulo: `Studio Monitor — ${rotulo}`,
          status: 'aviso',
          detalhe: 'A janela está sem nenhuma fonte selecionada.',
          comoResolver: 'Escolha a fonte na aba NDI do painel.',
        });
        continue;
      }

      const fonteExiste = estado.fontesDisponiveis.includes(estado.fonteAtual);
      passos.push({
        id: `monitor-${dispositivo.id}-${porta}`,
        titulo: `Studio Monitor — ${rotulo}`,
        status: fonteExiste ? 'ok' : 'falha',
        detalhe: fonteExiste
          ? `Exibindo "${estado.fonteAtual}".`
          : `Está selecionada a fonte "${estado.fonteAtual}", mas ela não está mais na rede. A tela deve estar preta.`,
        comoResolver: fonteExiste
          ? undefined
          : 'Ligue a máquina que envia essa imagem e confira se o NDI Screen Capture está rodando nela; ou escolha outra fonte na aba NDI.',
      });
    }
  }

  // Quem tem agente e deveria estar enviando a tela: o nome NDI padrão do
  // Screen Capture começa com o hostname da máquina.
  const deveriamEnviar = dispositivos.filter(
    (d) => d.host && d.servicos.agente && !comMonitor.every((m) => m.id === d.id),
  );

  for (const dispositivo of deveriamEnviar) {
    const prefixo = dispositivo.id.split('-').at(-1)?.toLowerCase() ?? '';
    const encontrada = [...fontesVistas].some((f) => f.toLowerCase().includes(prefixo));
    if (!encontrada && prefixo.length > 2) {
      passos.push({
        id: `envio-${dispositivo.id}`,
        titulo: `Envio de tela — ${dispositivo.nome}`,
        status: 'aviso',
        detalhe: `Nenhuma fonte NDI com "${prefixo}" no nome apareceu na rede.`,
        comoResolver: `Se o ${dispositivo.nome} precisa enviar a tela, abra o NDI Screen Capture nele.`,
      });
    }
  }

  return montar(passos, ctx);
}

function montar(passos: PassoCheck[], ctx: ContextoCheck): ResultadoCheck {
  const status = consolidarStatus(passos);
  const falha = passos.find((p) => p.status === 'falha');
  const aviso = passos.find((p) => p.status === 'aviso');
  const resultado: ResultadoCheck = {
    id: 'ndi',
    titulo: 'Teste do NDI',
    ts: Date.now(),
    status,
    resumo:
      status === 'ok'
        ? 'Todas as janelas estão exibindo uma fonte que existe na rede.'
        : (falha?.detalhe ?? aviso?.detalhe ?? 'Teste inconclusivo.'),
    passos,
  };
  ctx.publicar?.(resultado);
  return resultado;
}
