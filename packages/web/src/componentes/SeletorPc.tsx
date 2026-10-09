import { useEffect, useId, useState } from 'react';
import type { Aplicativo, EstadoDispositivo } from '@maestro/shared';
import { vibrar } from '../nucleo/vibrar';
import { Icone } from './Icone';
import { Semaforo } from './Semaforo';

/**
 * A máquina usa este programa? Ausente em `apps` = a equipe ainda não escolheu,
 * então vale tudo (mesma regra do Painel). Use junto do dado do programa
 * (`d.holyrics`, `d.powerpoint`...) para listar só as máquinas que fazem sentido.
 */
export function usaPrograma(d: EstadoDispositivo, app: Aplicativo): boolean {
  return !d.apps || d.apps.includes(app);
}

interface Props {
  /** Já filtrados para a tela: só as máquinas que têm aquele programa. */
  dispositivos: EstadoDispositivo[];
  /** Id da máquina atual. */
  atual: string | null;
  aoTrocar: (id: string) => void;
}

/**
 * Escolha do PC em qualquer tela: um botão com o nome da máquina atual e ⌄.
 * Abre uma folha que sobe de baixo no celular e um menu ao lado do botão no
 * desktop. Pensado para o slot de cabeçalho (`useControlesCabecalho`).
 */
export function SeletorPc({ dispositivos, atual, aoTrocar }: Props) {
  const [aberto, setAberto] = useState(false);
  const idLista = useId();
  const dispositivoAtual = dispositivos.find((d) => d.id === atual) ?? null;

  useEffect(() => {
    if (!aberto) return undefined;
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === 'Escape') setAberto(false);
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  if (dispositivos.length === 0) return null;

  // Uma máquina só: não há o que escolher, então é só informação (sem cara de botão).
  if (dispositivos.length === 1) {
    return <span className="info seletor-pc__unico">{dispositivos[0]?.nome}</span>;
  }

  return (
    <div className="seletor-pc">
      <button
        type="button"
        className="tocavel seletor-pc__botao"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        onClick={() => {
          vibrar(10);
          setAberto((v) => !v);
        }}
      >
        <span className="seletor-pc__nome">{dispositivoAtual?.nome ?? 'Escolher PC'}</span>
        <Icone nome="chevron-baixo" tamanho={18} />
      </button>

      {aberto ? (
        <>
          <div className="seletor-pc__fundo" onClick={() => setAberto(false)} aria-hidden="true" />
          <div className="seletor-pc__popup" role="dialog" aria-label="Escolher computador">
            <p className="seletor-pc__titulo">Computador</p>
            <ul id={idLista} role="listbox" className="seletor-pc__lista">
              {dispositivos.map((d) => {
                const marcado = d.id === atual;
                return (
                  <li key={d.id} role="option" aria-selected={marcado}>
                    <button
                      type="button"
                      className={`seletor-pc__item${marcado ? ' seletor-pc__item--atual' : ''}`}
                      onClick={() => {
                        vibrar(15);
                        setAberto(false);
                        if (!marcado) aoTrocar(d.id);
                      }}
                    >
                      <Semaforo estado={d.online ? 'online' : 'offline'} />
                      <span className="seletor-pc__item-nome">{d.nome}</span>
                      {marcado ? <Icone nome="ok" tamanho={20} /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}
