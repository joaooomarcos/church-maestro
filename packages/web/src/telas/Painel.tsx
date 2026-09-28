import { useEffect, useState } from 'react';
import { NOMES_APLICATIVOS, ROTAS, type Cenario, type EstadoDispositivo, type ResultadoCenario } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPost } from '../nucleo/cliente';
import { Semaforo, type EstadoSemaforo } from '../componentes/Semaforo';
import { ControleApps } from '../componentes/ControleApps';
import { Icone, type NomeIcone } from '../componentes/Icone';
import { IconeCenario } from '../componentes/IconeCenario';
import { vibrar } from '../nucleo/vibrar';

type Tom = 'normal' | 'ok' | 'alerta' | 'apagado';

interface Bloco {
  chave: string;
  icone: NomeIcone;
  titulo: string;
  valor: string;
  detalhe?: string;
  tom: Tom;
}

function estadoSemaforo(d: EstadoDispositivo): EstadoSemaforo {
  if (d.ultimoContato === null) return 'nao-configurado';
  return d.online ? 'online' : 'offline';
}

const ROTULO_ESTADO: Record<EstadoSemaforo, string> = {
  online: 'Online',
  offline: 'Offline',
  'nao-configurado': 'Sem contato',
};

/** Um bloco para cada coisa que a máquina faz, com o valor que importa em destaque. */
function montarBlocos(d: EstadoDispositivo): Bloco[] {
  const blocos: Bloco[] = [];

  if (d.obs) {
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

  if (d.holyrics) {
    const holyrics = d.holyrics;
    const apresentacao = holyrics.apresentacao;
    blocos.push(
      !holyrics.online
        ? { chave: 'holyrics', icone: 'holyrics', titulo: 'Holyrics', valor: 'Sem conexão', tom: 'apagado' }
        : apresentacao
          ? {
              chave: 'holyrics',
              icone: 'holyrics',
              titulo: 'Holyrics',
              valor: apresentacao.nome,
              detalhe: `slide ${apresentacao.slide ?? '?'} de ${apresentacao.totalSlides ?? '?'}`,
              tom: 'normal',
            }
          : { chave: 'holyrics', icone: 'holyrics', titulo: 'Holyrics', valor: 'Nada no ar', tom: 'apagado' },
    );
  }

  // O status do PowerPoint diz "fora da exibição" mesmo com ele fechado; quem
  // sabe se ele está aberto é a lista de programas do agente.
  if (d.powerpoint && d.agente?.capacidades.includes('powerpoint')) {
    const ppt = d.powerpoint;
    const aberto = d.agente.processos.powerpoint === true;
    blocos.push(
      !aberto
        ? { chave: 'ppt', icone: 'powerpoint', titulo: 'PowerPoint', valor: 'Fechado', tom: 'apagado' }
        : ppt.emApresentacao
          ? {
              chave: 'ppt',
              icone: 'powerpoint',
              titulo: 'PowerPoint',
              valor: `Slide ${ppt.slide ?? '?'} de ${ppt.totalSlides ?? '?'}`,
              ...(ppt.arquivo ? { detalhe: ppt.arquivo } : {}),
              tom: 'normal',
            }
          : {
              chave: 'ppt',
              icone: 'powerpoint',
              titulo: 'PowerPoint',
              valor: 'Aberto',
              detalhe: ppt.arquivo ?? 'fora da exibição',
              tom: 'normal',
            },
    );
  }

  for (const janela of d.ndi) {
    blocos.push({
      chave: `ndi-${janela.porta}`,
      icone: 'ndi',
      titulo: `NDI ${janela.porta}`,
      valor: !janela.online ? 'Sem conexão' : (janela.fonteAtual ?? 'Nenhuma fonte'),
      tom: !janela.online || !janela.fonteAtual ? 'apagado' : 'normal',
    });
  }

  return blocos;
}

/** O que está na frente naquela máquina — é o que está indo para a tela. */
function primeiroPlano(d: EstadoDispositivo): string | null {
  const janela = d.agente?.emPrimeiroPlano;
  if (!janela) return null;
  const nome = janela.app ? NOMES_APLICATIVOS[janela.app] : janela.processo;
  if (!janela.titulo) return nome;
  return janela.titulo.toLowerCase().includes(nome.toLowerCase()) ? janela.titulo : `${nome} — ${janela.titulo}`;
}

function CartaoMaquina({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const estado = estadoSemaforo(dispositivo);
  const blocos = montarBlocos(dispositivo);
  const naFrente = primeiroPlano(dispositivo);

  return (
    <article className={`cartao-maquina${estado === 'online' ? '' : ' cartao-maquina--fora'}`}>
      <header className="cartao-maquina__cabecalho">
        <Semaforo estado={estado} />
        <h2 className="cartao-maquina__nome">{dispositivo.nome}</h2>
        <span className={`cartao-maquina__estado cartao-maquina__estado--${estado}`}>{ROTULO_ESTADO[estado]}</span>
      </header>

      {naFrente ? (
        <p className="cartao-maquina__frente">
          <span className="cartao-maquina__frente-rotulo">Na frente</span>
          <span className="cartao-maquina__frente-valor">{naFrente}</span>
        </p>
      ) : null}

      {blocos.length > 0 ? (
        <div className="blocos">
          {blocos.map((bloco) => (
            <div key={bloco.chave} className={`bloco bloco--${bloco.tom}`}>
              <p className="bloco__titulo">
                <Icone nome={bloco.icone} tamanho={16} />
                {bloco.titulo}
              </p>
              <p className="bloco__valor">{bloco.valor}</p>
              {bloco.detalhe ? <p className="bloco__detalhe">{bloco.detalhe}</p> : null}
            </div>
          ))}
        </div>
      ) : dispositivo.agente && !dispositivo.agente.online ? (
        <p className="cartao-maquina__aviso">{dispositivo.agente.erro ?? 'Agente sem resposta.'}</p>
      ) : null}

      <ControleApps dispositivo={dispositivo} />
    </article>
  );
}

export function Painel() {
  const { snapshot, notificar } = useAppContexto();
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [executando, setExecutando] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ cenarios: Cenario[] }>(ROTAS.cenarios)
      .then((resposta) => setCenarios(resposta.cenarios))
      .catch(() => {
        // erro já virou toast pelo cliente de API.
      });
  }, []);

  async function executarCenario(cenario: Cenario): Promise<void> {
    vibrar(15);
    setExecutando(cenario.id);
    try {
      const resultado = await apiPost<ResultadoCenario>(ROTAS.executarCenario, { cenarioId: cenario.id });
      if (resultado.ok) {
        notificar(`"${cenario.nome}" aplicado.`, 'info');
      } else {
        const falhas = resultado.acoes.filter((a) => !a.ok).map((a) => `${a.descricao}: ${a.erro ?? 'falhou'}`);
        notificar(`"${cenario.nome}" teve falhas — ${falhas.join('; ')}`, 'alerta');
      }
    } catch {
      // erro já virou toast pelo cliente de API.
    } finally {
      setExecutando(null);
    }
  }

  return (
    <div className="painel">
      {cenarios.length > 0 ? (
        <section className="atalhos-cenarios" aria-label="Cenários">
          {cenarios.map((cenario) => (
            <button
              key={cenario.id}
              type="button"
              className="atalho-cenario"
              disabled={executando === cenario.id}
              onClick={() => void executarCenario(cenario)}
            >
              <IconeCenario icone={cenario.icone} tamanho={22} />
              <span>{executando === cenario.id ? 'Aplicando…' : cenario.nome}</span>
            </button>
          ))}
        </section>
      ) : null}

      <section className="painel__maquinas">
        {!snapshot ? (
          <p className="painel__vazio">Carregando máquinas…</p>
        ) : snapshot.dispositivos.length === 0 ? (
          <p className="painel__vazio">Nenhuma máquina cadastrada. Rode o instalador em cada uma.</p>
        ) : (
          snapshot.dispositivos.map((dispositivo) => <CartaoMaquina key={dispositivo.id} dispositivo={dispositivo} />)
        )}
      </section>
    </div>
  );
}
