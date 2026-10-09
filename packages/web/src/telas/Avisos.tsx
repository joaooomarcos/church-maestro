import { useState } from 'react';
import { MONITOR_TODOS, ROTAS, type EstadoDispositivo } from '@maestro/shared';
import { useAppContexto, useControlesRodape } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';
import { nomeDoMonitor } from '../nucleo/monitores';
import { Icone } from '../componentes/Icone';
import {
  DURACOES,
  DuracaoAviso,
  TelasAviso,
  monitorPrincipal,
  precisaEscolherTela,
} from '../componentes/OpcoesAviso';
import '../estilos/avisos.css';

const CHAVE_RECENTES = 'maestro:avisos-recentes';
const CHAVE_DESTINOS = 'maestro:avisos-destinos';
const MAXIMO_RECENTES = 6;
const MAXIMO_CARACTERES = 300;
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

/** "Tela 2 · 1920×1080 (principal)" vira só "Tela 2", que cabe no resumo do rodapé. */
function telaCurta(maquina: EstadoDispositivo, monitor: string | null | undefined): string {
  if (monitor === MONITOR_TODOS) return 'todas as telas';
  const id = monitor ?? monitorPrincipal(maquina);
  const encontrado = maquina.agente?.monitores?.find((m) => m.id === id);
  return encontrado ? (nomeDoMonitor(encontrado).split(' · ')[0] ?? id ?? '') : (id ?? 'tela principal');
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
  const [fecharPorMaquina, setFecharPorMaquina] = useState(false);

  function alternar(id: string): void {
    vibrar(8);
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
  const escolhidas = maquinas.filter((m) => dispositivos.includes(m.id));
  const comVariasTelas = escolhidas.filter((m) => precisaEscolherTela(m, monitores));
  const noPainel = destinos.includes(PAINEL);
  const texto = mensagem.trim();

  async function enviar(): Promise<void> {
    if (!texto) return notificar('Escreva a mensagem.', 'alerta');
    if (dispositivos.length === 0 && !noPainel) return notificar('Escolha onde o aviso aparece.', 'alerta');
    vibrar(15);
    setEnviando(true);
    try {
      const escolhas = Object.fromEntries(escolhidas.map((m) => [m.id, monitores[m.id] ?? monitorPrincipal(m)]));
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

  // Resumo do que vai acontecer, lido logo acima do botão: onde (e em que tela) e por quanto tempo.
  const alvos = [
    ...escolhidas.map((m) =>
      precisaEscolherTela(m, monitores) ? `${m.nome} (${telaCurta(m, monitores[m.id])})` : m.nome,
    ),
    ...(noPainel ? ['Painel'] : []),
  ];
  const duracao = DURACOES.find((d) => d.segundos === segundos)?.rotulo ?? `${segundos} s`;
  const pronto = texto.length > 0 && alvos.length > 0;

  useControlesRodape(
    <div className="avisos-rodape">
      <p className={`avisos-rodape__resumo${comVariasTelas.length > 0 ? ' avisos-rodape__resumo--cuidado' : ''}`}>
        {alvos.length === 0 ? (
          'Escolha onde o aviso aparece.'
        ) : (
          <>
            {comVariasTelas.length > 0 ? <Icone nome="aviso" tamanho={16} /> : null}
            <span>
              Vai aparecer em: <strong>{alvos.join(', ')}</strong> · {segundos === null ? 'até tocarem em Ok' : duracao}
            </span>
          </>
        )}
      </p>
      <button
        type="button"
        className={`avisos-rodape__enviar${pronto ? '' : ' avisos-rodape__enviar--incompleto'}`}
        disabled={enviando}
        onClick={() => void enviar()}
      >
        <Icone nome="sino" tamanho={22} /> {enviando ? 'Enviando…' : 'Enviar aviso'}
      </button>
    </div>,
  );

  return (
    <div className="avisos">
      <section className="avisos__bloco">
        <label className="campo">
          <span className="avisos__rotulo-linha">
            <span className="campo__rotulo">Mensagem</span>
            <span className="avisos__contador">
              {mensagem.length}/{MAXIMO_CARACTERES}
            </span>
          </span>
          <textarea
            className="campo__entrada campo__entrada--texto"
            rows={3}
            maxLength={MAXIMO_CARACTERES}
            value={mensagem}
            placeholder="Ex.: Podem iniciar a transmissão"
            onChange={(e) => setMensagem(e.target.value)}
          />
        </label>

        {recentes.length > 0 ? (
          <div className="campo">
            <span className="campo__rotulo">Usados há pouco</span>
            <ul className="avisos__recentes">
              {recentes.map((recente) => (
                <li key={recente} className="avisos__recente">
                  <button
                    type="button"
                    className="avisos__usar"
                    title={recente}
                    onClick={() => setMensagem(recente)}
                  >
                    {recente}
                  </button>
                  <button
                    type="button"
                    className="avisos__esquecer"
                    aria-label={`Esquecer "${recente}"`}
                    onClick={() => esquecer(recente)}
                  >
                    <Icone nome="fechar" tamanho={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="avisos__bloco">
        <div className="campo">
          <span className="campo__rotulo">Onde aparece</span>
          <div className="avisos-destinos" role="group" aria-label="Onde aparece">
            {[
              ...maquinas.map((m) => ({ id: m.id, nome: m.nome, desligada: !m.agente?.online })),
              { id: PAINEL, nome: 'Painel (celulares)', desligada: false },
            ].map((destino) => {
              const marcado = destinos.includes(destino.id);
              return (
                <button
                  key={destino.id}
                  type="button"
                  aria-pressed={marcado}
                  className={`avisos-destino${marcado ? ' avisos-destino--marcado' : ''}`}
                  onClick={() => alternar(destino.id)}
                >
                  {marcado ? (
                    <Icone nome="ok" tamanho={20} />
                  ) : (
                    <span className="avisos-destino__vazio" aria-hidden="true" />
                  )}
                  <span className="avisos-destino__nome">
                    {destino.nome}
                    {destino.desligada ? <span className="avisos-destino__estado">desligada</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="avisos-dica">Nas máquinas, abre uma janela por cima de tudo.</p>
        </div>

        {comVariasTelas.length > 0 ? (
          <p className="info avisos-cuidado">
            <Icone nome="aviso" tamanho={18} />
            <span>
              Confira a tela de cada máquina: cuidado com a do <strong>telão</strong> e com a que vai para a{' '}
              <strong>live</strong>.
            </span>
          </p>
        ) : null}

        <TelasAviso
          maquinas={escolhidas}
          monitores={monitores}
          aoEscolherMonitor={(id, monitor) => setMonitores((atuais) => ({ ...atuais, [id]: monitor ?? null }))}
        />
      </section>

      <section className="avisos__bloco">
        <DuracaoAviso segundos={segundos} aoEscolherSegundos={setSegundos} />
      </section>

      <section className="avisos__bloco avisos-preso">
        <div className="avisos-preso__cabecalho">
          <span className="campo__rotulo">Aviso preso na tela?</span>
          <span className="avisos-dica">Fecha as janelas de aviso de longe.</span>
        </div>
        <div className="avisos-preso__acoes">
          <button
            type="button"
            className="tocavel tocavel--vermelho avisos-preso__botao"
            disabled={fechando}
            onClick={() => void fecharAvisos([])}
          >
            <Icone nome="fechar" tamanho={18} /> Fechar em todas
          </button>
          <button
            type="button"
            className="tocavel avisos-preso__botao"
            aria-expanded={fecharPorMaquina}
            onClick={() => setFecharPorMaquina((aberto) => !aberto)}
          >
            Por máquina
            <span className="tocavel__seta">
              <Icone nome={fecharPorMaquina ? 'subir' : 'chevron-baixo'} tamanho={18} />
            </span>
          </button>
        </div>
        {fecharPorMaquina ? (
          <div className="avisos-preso__maquinas">
            {maquinas.map((maquina) => (
              <button
                key={maquina.id}
                type="button"
                className="tocavel tocavel--vermelho avisos-preso__botao"
                disabled={fechando || !maquina.agente?.online}
                onClick={() => void fecharAvisos([maquina.id])}
              >
                <Icone nome="fechar" tamanho={16} /> {maquina.nome}
              </button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
