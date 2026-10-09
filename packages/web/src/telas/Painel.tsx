import { useEffect, useState } from 'react';
import { ROTAS, type Cenario, type EstadoDispositivo, type ResultadoCenario } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiGet, apiPost } from '../nucleo/cliente';
import { Semaforo } from '../componentes/Semaforo';
import { BlocosMaquina, ROTULO_ESTADO, estadoSemaforo } from '../componentes/BlocosMaquina';
import { BotaoLigar } from '../componentes/BotaoLigar';
import { CartoesAutomacao } from '../componentes/CartoesAutomacao';
import { Icone } from '../componentes/Icone';
import { IconeCenario } from '../componentes/IconeCenario';
import { vibrar } from '../nucleo/vibrar';
import '../estilos/painel.css';

function CartaoMaquina({ dispositivo }: { dispositivo: EstadoDispositivo }) {
  const { abrirTela } = useAppContexto();
  const estado = estadoSemaforo(dispositivo);

  function abrirDetalhes(): void {
    vibrar(10);
    abrirTela('maquinas', { pcId: dispositivo.id });
  }

  return (
    <article
      className={`cartao-maquina cartao-maquina--tocavel${estado === 'online' ? '' : ' cartao-maquina--fora'}`}
      onClick={abrirDetalhes}
    >
      <header className="cartao-maquina__cabecalho">
        <Semaforo estado={estado} />
        <h2 className="cartao-maquina__nome">{dispositivo.nome}</h2>
        <span className={`cartao-maquina__estado cartao-maquina__estado--${estado}`}>{ROTULO_ESTADO[estado]}</span>
        {dispositivo.agente ? <BotaoLigar dispositivo={dispositivo} /> : null}
        <button
          type="button"
          className="cartao-maquina__detalhes tocavel__seta"
          aria-label={`Abrir detalhes de ${dispositivo.nome}`}
          onClick={(evento) => {
            evento.stopPropagation();
            abrirDetalhes();
          }}
        >
          <Icone nome="chevron-dir" tamanho={20} />
        </button>
      </header>

      <BlocosMaquina dispositivo={dispositivo} />

      {dispositivo.agente && !dispositivo.agente.online ? (
        <p className="cartao-maquina__aviso">{dispositivo.agente.erro ?? 'Agente sem resposta.'}</p>
      ) : null}
    </article>
  );
}

export function Painel() {
  const { snapshot, notificar, recarregarAutomacoes } = useAppContexto();
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [executando, setExecutando] = useState<string | null>(null);

  // Ao abrir o Painel, confere de novo os próximos horários e a última execução.
  useEffect(() => {
    recarregarAutomacoes();
  }, [recarregarAutomacoes]);

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

      <CartoesAutomacao />

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
