import {
  NOMES_APLICATIVOS,
  type Aplicativo,
  type EstadoDispositivo,
} from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { Icone, type NomeIcone } from './Icone';
import type { EstadoSemaforo } from './Semaforo';
import type { TelaId } from './MenuLateral';
import { vibrar } from '../nucleo/vibrar';
import '../estilos/painel.css';

type Tom = 'normal' | 'ok' | 'alerta' | 'apagado';

interface Bloco {
  chave: string;
  icone: NomeIcone;
  titulo: string;
  valor: string;
  detalhe?: string;
  tom: Tom;
  /** Tela que o toque abre; ausente = só informação (OBS). */
  destino?: TelaId;
  /** O destino abre já nesta máquina. */
  comMaquina?: boolean;
}

export function estadoSemaforo(d: EstadoDispositivo): EstadoSemaforo {
  if (d.ultimoContato === null) return 'nao-configurado';
  return d.online ? 'online' : 'offline';
}

export const ROTULO_ESTADO: Record<EstadoSemaforo, string> = {
  online: 'Online',
  offline: 'Offline',
  'nao-configurado': 'Sem contato',
};

/**
 * Bloco só para programa que a máquina usa e que está aberto: quem está fechado
 * já aparece na lista de programas, e um quadro "fechado" só ocupa lugar.
 * Aberto mas sem responder continua aparecendo, porque aí há algo a resolver.
 */
function aparece(d: EstadoDispositivo, app: Aplicativo, respondendo: boolean): boolean {
  if (d.apps && !d.apps.includes(app)) return false;
  const processo = d.agente?.processos[app];
  return respondendo || processo === true;
}

/** Um bloco para cada coisa que a máquina faz, com o valor que importa em destaque. */
export function montarBlocos(d: EstadoDispositivo): Bloco[] {
  const blocos: Bloco[] = [];

  if (d.obs && aparece(d, 'obs', d.obs.online)) {
    const obs = d.obs;
    if (!obs.online) {
      blocos.push({ chave: 'obs', icone: 'transmitir', titulo: 'OBS', valor: 'Sem conexão', tom: 'apagado' });
    } else if (obs.transmitindo) {
      const perdendo = obs.percFramesPerdidos > 1;
      blocos.push({
        chave: 'obs',
        icone: 'transmitir',
        titulo: 'OBS',
        valor: perdendo ? 'Ao vivo · perdendo frames' : 'Ao vivo',
        detalhe: `${Math.round(obs.bitrateKbps)} kbps${obs.cenaAtual ? ` · ${obs.cenaAtual}` : ''}`,
        tom: perdendo ? 'alerta' : 'ok',
      });
    } else {
      blocos.push({
        chave: 'obs',
        icone: 'transmitir',
        titulo: 'OBS',
        valor: 'Fora do ar',
        ...(obs.cenaAtual ? { detalhe: obs.cenaAtual } : {}),
        tom: 'normal',
      });
    }
  }

  if (d.holyrics && aparece(d, 'holyrics', d.holyrics.online)) {
    const holyrics = d.holyrics;
    const apresentacao = holyrics.apresentacao;
    const base = { chave: 'holyrics', icone: 'holyrics' as const, titulo: 'Holyrics', destino: 'holyrics' as const, comMaquina: true };
    blocos.push(
      !holyrics.online
        ? { ...base, valor: 'Sem conexão', tom: 'apagado' }
        : apresentacao
          ? {
              ...base,
              valor: apresentacao.nome,
              detalhe: `slide ${apresentacao.slide ?? '?'} de ${apresentacao.totalSlides ?? '?'}`,
              tom: 'normal',
            }
          : { ...base, valor: 'Nada no ar', tom: 'apagado' },
    );
  }

  // O status do PowerPoint diz "fora da exibição" mesmo com ele fechado; quem
  // sabe se ele está aberto é a lista de programas do agente.
  if (
    d.powerpoint &&
    d.agente?.capacidades.includes('powerpoint') &&
    d.agente.processos.powerpoint === true &&
    aparece(d, 'powerpoint', true)
  ) {
    const ppt = d.powerpoint;
    const base = { chave: 'ppt', icone: 'powerpoint' as const, titulo: 'PowerPoint', destino: 'powerpoint' as const, comMaquina: true };
    blocos.push(
      ppt.emApresentacao
        ? {
            ...base,
            valor: `Slide ${ppt.slide ?? '?'} de ${ppt.totalSlides ?? '?'}`,
            ...(ppt.arquivo ? { detalhe: ppt.arquivo } : {}),
            tom: 'normal',
          }
        : { ...base, valor: 'Aberto', detalhe: ppt.arquivo ?? 'fora da exibição', tom: 'normal' },
    );
  }

  for (const janela of d.ndi) {
    if (!aparece(d, 'ndi-studio-monitor', janela.online)) continue;
    blocos.push({
      chave: `ndi-${janela.porta}`,
      icone: 'ndi',
      titulo: `NDI ${janela.porta}`,
      valor: !janela.online ? 'Sem conexão' : (janela.fonteAtual ?? 'Nenhuma fonte'),
      tom: !janela.online || !janela.fonteAtual ? 'apagado' : 'normal',
      destino: 'ndi',
    });
  }

  return blocos;
}

/** O que está na frente naquela máquina — é o que está indo para a tela. */
export function primeiroPlano(d: EstadoDispositivo): string | null {
  const janela = d.agente?.emPrimeiroPlano;
  if (!janela) return null;
  const nome = janela.app ? NOMES_APLICATIVOS[janela.app] : janela.processo;
  if (!janela.titulo) return nome;
  return janela.titulo.toLowerCase().includes(nome.toLowerCase()) ? janela.titulo : `${nome} — ${janela.titulo}`;
}

/** "Na frente" (só informação) e os quadros do que está rodando, com as regras de toque. */
export function BlocosMaquina({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const { abrirTela } = useAppContexto();
  const blocos = montarBlocos(dispositivo);
  const naFrente = primeiroPlano(dispositivo);

  return (
    <>
      {naFrente ? (
        <p className="cartao-maquina__frente info">
          <span className="cartao-maquina__frente-rotulo">Na frente</span>
          <span className="cartao-maquina__frente-valor">{naFrente}</span>
        </p>
      ) : null}

      {blocos.length > 0 ? (
        <div className="blocos">
          {blocos.map((bloco) => {
            const conteudo = (
              <>
                <span className="bloco__titulo">
                  <Icone nome={bloco.icone} tamanho={16} />
                  {bloco.titulo}
                  {bloco.destino ? (
                    <span className="tocavel__seta">
                      <Icone nome="chevron-dir" tamanho={16} />
                    </span>
                  ) : null}
                </span>
                <span className="bloco__valor">{bloco.valor}</span>
                {bloco.detalhe ? <span className="bloco__detalhe">{bloco.detalhe}</span> : null}
              </>
            );
            const destino = bloco.destino;
            if (!destino) {
              return (
                <div key={bloco.chave} className={`bloco bloco--${bloco.tom} info`}>
                  {conteudo}
                </div>
              );
            }
            return (
              <button
                key={bloco.chave}
                type="button"
                className={`bloco bloco--${bloco.tom} tocavel`}
                onClick={(evento) => {
                  evento.stopPropagation();
                  vibrar(10);
                  abrirTela(destino, bloco.comMaquina ? { pcId: dispositivo.id } : undefined);
                }}
              >
                {conteudo}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
