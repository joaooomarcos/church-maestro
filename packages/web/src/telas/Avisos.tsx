import { useState } from 'react';
import { ROTAS } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { Icone } from '../componentes/Icone';
import { OpcoesAviso, monitorPrincipal } from '../componentes/OpcoesAviso';

const CHAVE_RECENTES = 'maestro:avisos-recentes';
const CHAVE_DESTINOS = 'maestro:avisos-destinos';
const MAXIMO_RECENTES = 6;
const PAINEL = 'painel';

function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = window.localStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: unknown): void {
  try {
    window.localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // sem armazenamento: só não lembra
  }
}

/** Mandar um aviso agora, sem montar cenário: "câmera 2 sem imagem", "podem começar". */
export function Avisos() {
  const { snapshot, notificar } = useAppContexto();
  const maquinas = (snapshot?.dispositivos ?? []).filter((d) => d.agente !== undefined);
  const [mensagem, setMensagem] = useState('');
  const [destinos, setDestinos] = useState<string[]>(() => ler<string[]>(CHAVE_DESTINOS, []));
  const [recentes, setRecentes] = useState<string[]>(() => ler<string[]>(CHAVE_RECENTES, []));
  const [enviando, setEnviando] = useState(false);
  // Escolhido na hora do envio e não lembrado: um aviso no telão aparece para a
  // igreja, então cada envio parte do monitor principal da máquina.
  const [monitores, setMonitores] = useState<Record<string, string | null>>({});
  // Também não é lembrado: cada aviso decide se some sozinho ou fica até o "Ok".
  const [segundos, setSegundos] = useState<number | null>(null);
  const [fechando, setFechando] = useState(false);

  function alternar(id: string): void {
    setDestinos((atuais) => {
      const novos = atuais.includes(id) ? atuais.filter((d) => d !== id) : [...atuais, id];
      gravar(CHAVE_DESTINOS, novos);
      return novos;
    });
  }

  function esquecer(texto: string): void {
    const novos = recentes.filter((r) => r !== texto);
    setRecentes(novos);
    gravar(CHAVE_RECENTES, novos);
  }

  const dispositivos = destinos.filter((d) => d !== PAINEL && maquinas.some((m) => m.id === d));
  const noPainel = destinos.includes(PAINEL);
  const texto = mensagem.trim();

  async function enviar(): Promise<void> {
    if (!texto) return notificar('Escreva a mensagem.', 'alerta');
    if (dispositivos.length === 0 && !noPainel) return notificar('Escolha onde o aviso aparece.', 'alerta');
    vibrar(15);
    setEnviando(true);
    try {
      const escolhas = Object.fromEntries(
        maquinas.filter((m) => dispositivos.includes(m.id)).map((m) => [m.id, monitores[m.id] ?? monitorPrincipal(m)]),
      );
      const { falhas } = await apiPost<{ falhas: string[] }>(ROTAS.aviso, {
        dispositivos,
        mensagem: texto,
        noPainel,
        monitores: escolhas,
        segundos,
      });
      const novos = [texto, ...recentes.filter((r) => r !== texto)].slice(0, MAXIMO_RECENTES);
      setRecentes(novos);
      gravar(CHAVE_RECENTES, novos);
      setMensagem('');
      if (falhas.length > 0) notificar(`Não chegou em: ${falhas.join('; ')}`, 'alerta');
      else notificar('Aviso enviado.', 'info');
    } catch {
      // erro já virou toast
    } finally {
      setEnviando(false);
    }
  }

  async function fecharAvisos(ids: string[]): Promise<void> {
    vibrar(15);
    setFechando(true);
    try {
      const { falhas } = await apiPost<{ falhas: string[] }>(ROTAS.avisoFechar, { dispositivos: ids });
      if (falhas.length > 0) notificar(`Não consegui fechar em: ${falhas.join('; ')}`, 'alerta');
      else notificar('Avisos fechados.', 'info');
    } catch {
      // erro já virou toast
    } finally {
      setFechando(false);
    }
  }

  return (
    <div className="avisos">
      <section className="versoes__alvo cenario-editor">
        <label className="campo">
          <span className="campo__rotulo">Mensagem</span>
          <textarea
            className="campo__entrada campo__entrada--texto"
            rows={3}
            maxLength={300}
            value={mensagem}
            placeholder="Ex.: Podem iniciar a transmissão"
            onChange={(e) => setMensagem(e.target.value)}
          />
        </label>

        <div className="campo">
          <span className="campo__rotulo">Onde aparece</span>
          <div className="seletor-dias seletor-dias--livre">
            {maquinas.map((maquina) => {
              const marcado = destinos.includes(maquina.id);
              return (
                <button
                  key={maquina.id}
                  type="button"
                  aria-pressed={marcado}
                  className={`seletor-dias__dia${marcado ? ' seletor-dias__dia--marcado' : ''}`}
                  onClick={() => alternar(maquina.id)}
                >
                  {maquina.nome}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={noPainel}
              className={`seletor-dias__dia${noPainel ? ' seletor-dias__dia--marcado' : ''}`}
              onClick={() => alternar(PAINEL)}
            >
              Painel (celulares)
            </button>
          </div>
        </div>

        <OpcoesAviso
          maquinas={maquinas.filter((m) => dispositivos.includes(m.id))}
          monitores={monitores}
          aoEscolherMonitor={(id, monitor) => setMonitores((atuais) => ({ ...atuais, [id]: monitor ?? null }))}
          segundos={segundos}
          aoEscolherSegundos={setSegundos}
        />

        <button type="button" className="botao-acao" disabled={enviando} onClick={() => void enviar()}>
          <Icone nome="sino" tamanho={20} /> {enviando ? 'Enviando…' : 'Enviar aviso'}
        </button>
        <p className="versoes__dica">
          Nas máquinas, abre uma janela por cima de tudo. Máquina com mais de uma tela
          pergunta em qual delas; cuidado com a do telão e com a que vai para a live.
        </p>
      </section>

      <section className="versoes__alvo">
        <h2 className="versoes__titulo">Aviso preso na tela?</h2>
        <p className="versoes__dica">
          Fecha as janelas de aviso que estiverem abertas, sem precisar chegar perto da máquina (no telão, por
          exemplo).
        </p>
        <div className="seletor-dias seletor-dias--livre">
          <button type="button" className="botao-secundario" disabled={fechando} onClick={() => void fecharAvisos([])}>
            Fechar em todas as máquinas
          </button>
          {maquinas.map((maquina) => (
            <button
              key={maquina.id}
              type="button"
              className="botao-secundario"
              disabled={fechando || !maquina.agente?.online}
              onClick={() => void fecharAvisos([maquina.id])}
            >
              {maquina.nome}
            </button>
          ))}
        </div>
      </section>

      {recentes.length > 0 ? (
        <section className="versoes__alvo">
          <h2 className="versoes__titulo">Usados há pouco</h2>
          <ul className="avisos__recentes">
            {recentes.map((recente) => (
              <li key={recente} className="avisos__recente">
                <button type="button" className="avisos__usar" onClick={() => setMensagem(recente)}>
                  {recente}
                </button>
                <button
                  type="button"
                  className="botao-icone"
                  aria-label="Esquecer esta mensagem"
                  onClick={() => esquecer(recente)}
                >
                  <Icone nome="fechar" tamanho={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
