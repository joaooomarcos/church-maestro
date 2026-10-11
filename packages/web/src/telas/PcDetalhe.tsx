import { useEffect, useMemo, useState } from 'react';
import { ROTAS, type EstadoDispositivo } from '@maestro/shared';
import { useAppContexto, useControlesCabecalho } from '../contexto/AppContext';
import { BlocosMaquina, ROTULO_ESTADO, estadoSemaforo } from '../componentes/BlocosMaquina';
import { BotaoLigar } from '../componentes/BotaoLigar';
import { ControleApps } from '../componentes/ControleApps';
import { Icone } from '../componentes/Icone';
import { SeletorPc } from '../componentes/SeletorPc';
import { Semaforo } from '../componentes/Semaforo';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import '../estilos/painel.css';

/** "há 5 min", "há 2 h", "há 3 dias". */
function haQuanto(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'há instantes';
  const min = Math.round(s / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Sem permissão de área de transferência (http fora de localhost): tenta o jeito antigo.
    try {
      const campo = document.createElement('textarea');
      campo.value = texto;
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      const ok = document.execCommand('copy');
      campo.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const { notificar } = useAppContexto();
  return (
    <button
      type="button"
      className="tocavel pc-detalhe__copiar"
      aria-label={`Copiar ${rotulo}`}
      onClick={() => {
        vibrar(10);
        void copiarTexto(texto).then((ok) => notificar(ok ? 'Copiado' : 'Não foi possível copiar.', ok ? 'info' : 'alerta'));
      }}
    >
      <Icone nome="copiar" tamanho={18} />
    </button>
  );
}

function Rede({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const mac = dispositivo.mac ?? dispositivo.agente?.mac;
  const versao = dispositivo.agente?.versao;
  const visto = dispositivo.ultimoVisto ?? dispositivo.ultimoContato;

  return (
    <section className="info pc-detalhe__rede" aria-label="Rede">
      <h3 className="pc-detalhe__titulo">Rede</h3>
      <div className="pc-detalhe__linha">
        <span className="pc-detalhe__rotulo">IP</span>
        <span className="pc-detalhe__valor">
          {dispositivo.host || 'não conhecido'}
          {dispositivo.host ? <BotaoCopiar texto={dispositivo.host} rotulo="IP" /> : null}
        </span>
      </div>
      {mac ? (
        <div className="pc-detalhe__linha">
          <span className="pc-detalhe__rotulo">MAC</span>
          <span className="pc-detalhe__valor">
            {mac}
            <BotaoCopiar texto={mac} rotulo="MAC" />
          </span>
        </div>
      ) : null}
      <div className="pc-detalhe__linha">
        <span className="pc-detalhe__rotulo">Agente</span>
        <span className="pc-detalhe__valor">{versao ? `versão ${versao}` : 'versão desconhecida'}</span>
      </div>
      {!dispositivo.online ? (
        <div className="pc-detalhe__linha">
          <span className="pc-detalhe__rotulo">Offline</span>
          <span className="pc-detalhe__valor">
            {visto ? `visto pela última vez ${haQuanto(visto)}` : 'ainda não foi visto'}
          </span>
        </div>
      ) : null}
    </section>
  );
}

/** Quanto esperar o painel confirmar a troca antes de voltar a mostrar o que a máquina diz. */
const ESPERA_CONFIRMACAO_MS = 15_000;

/**
 * "Manter ligado": com o interruptor ligado, a máquina não entra em repouso nem
 * apaga a tela por inatividade. Só aparece onde o agente oferece (Windows).
 */
function ManterLigado({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const informado = dispositivo.agente?.manterLigado;
  // Escolha recém-feita, até a próxima leitura do painel confirmar.
  const [pedido, setPedido] = useState<boolean | null>(null);

  useEffect(() => setPedido(null), [dispositivo.id]);
  useEffect(() => {
    if (pedido === null) return undefined;
    if (pedido === informado) {
      setPedido(null);
      return undefined;
    }
    const timer = window.setTimeout(() => setPedido(null), ESPERA_CONFIRMACAO_MS);
    return () => window.clearTimeout(timer);
  }, [pedido, informado]);

  if (!dispositivo.agente?.online || informado === undefined) return null;
  const ligado = pedido ?? informado;

  async function alternar(): Promise<void> {
    vibrar(15);
    const novo = !ligado;
    setPedido(novo);
    try {
      await apiPost(ROTAS.manterLigado, { dispositivo: dispositivo.id, ligado: novo });
    } catch {
      // erro já virou toast pelo cliente de API.
      setPedido(null);
    }
  }

  return (
    <section className="info pc-detalhe__rede" aria-label="Energia">
      <div className="pc-detalhe__linha">
        <span>
          <span className="pc-detalhe__titulo">Manter ligado</span>
          <span className="versoes__dica pc-detalhe__dica">
            {ligado
              ? 'A máquina não entra em repouso nem apaga a tela.'
              : 'Desligado: a máquina segue o tempo de repouso do Windows.'}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label={`Manter ${dispositivo.nome} ligado`}
          className={`interruptor${ligado ? ' interruptor--ligado' : ''}`}
          onClick={() => void alternar()}
        >
          <span className="interruptor__bolinha" />
        </button>
      </div>
    </section>
  );
}

export function PcDetalhe() {
  const { snapshot, maquinaPedida } = useAppContexto();
  const dispositivos = useMemo(() => snapshot?.dispositivos ?? [], [snapshot]);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(() => maquinaPedida('maquinas'));

  useEffect(() => {
    if (dispositivos.length === 0) return;
    if (!selecionadoId || !dispositivos.some((d) => d.id === selecionadoId)) {
      setSelecionadoId(dispositivos[0]?.id ?? null);
    }
  }, [dispositivos, selecionadoId]);

  const atual = dispositivos.find((d) => d.id === selecionadoId) ?? null;

  useControlesCabecalho(<SeletorPc dispositivos={dispositivos} atual={selecionadoId} aoTrocar={setSelecionadoId} />);

  if (!snapshot) return <p className="painel__vazio">Carregando máquinas…</p>;
  if (!atual) return <p className="painel__vazio">Nenhuma máquina cadastrada. Rode o instalador em cada uma.</p>;

  const estado = estadoSemaforo(atual);

  return (
    <div className="pc-detalhe">
      <header className="pc-detalhe__topo">
        <Semaforo estado={estado} />
        <h2 className="cartao-maquina__nome">{atual.nome}</h2>
        <span className={`cartao-maquina__estado cartao-maquina__estado--${estado}`}>{ROTULO_ESTADO[estado]}</span>
        {atual.agente ? <BotaoLigar dispositivo={atual} /> : null}
      </header>

      <Rede dispositivo={atual} />

      <ManterLigado dispositivo={atual} />

      <BlocosMaquina dispositivo={atual} />

      <ControleApps dispositivo={atual} />
    </div>
  );
}
