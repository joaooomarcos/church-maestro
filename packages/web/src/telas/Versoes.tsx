import { useCallback, useEffect, useRef, useState } from 'react';
import { ALVO_HUB, ROTAS, type MaquinaVersao, type RespostaVersoes } from '@maestro/shared';
import { apiGet, apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

const INTERVALO_NORMAL_MS = 15_000;
/** Durante uma atualização a tela acompanha de perto o que a máquina responde. */
const INTERVALO_ATUALIZANDO_MS = 4000;

function curto(sha: string | null): string {
  return sha ? sha.slice(0, 7) : '—';
}

function estaAtualizando(maquina: MaquinaVersao): boolean {
  const estado = maquina.atualizacao?.estado;
  return estado === 'baixando' || estado === 'compilando' || estado === 'trocando';
}

function rotuloEstado(maquina: MaquinaVersao): string | null {
  const atualizacao = maquina.atualizacao;
  if (!atualizacao) return null;
  if (estaAtualizando(maquina)) return atualizacao.mensagem || 'Atualizando…';
  if (atualizacao.estado === 'falhou') return atualizacao.mensagem || 'A última atualização falhou.';
  return null;
}

export function Versoes() {
  const [dados, setDados] = useState<RespostaVersoes | null>(null);
  const [shaEscolhido, setShaEscolhido] = useState<string>('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const resposta = await apiGet<RespostaVersoes>(ROTAS.versoes);
      setDados(resposta);
      setShaEscolhido((atual) => atual || resposta.aprovada?.sha || resposta.disponiveis[0]?.sha || '');
    } catch {
      // erro já virou toast pelo cliente de API
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Enquanto alguma máquina estiver trocando de versão, olha mais de perto.
  useEffect(() => {
    const alguemAtualizando = dados?.maquinas.some(estaAtualizando) ?? false;
    const intervalo = alguemAtualizando ? INTERVALO_ATUALIZANDO_MS : INTERVALO_NORMAL_MS;
    timer.current = window.setTimeout(() => void carregar(), intervalo);
    return () => window.clearTimeout(timer.current);
  }, [dados, carregar]);

  async function atualizar(maquina: MaquinaVersao): Promise<void> {
    if (!shaEscolhido || enviando) return;
    const alvo = maquina.id === ALVO_HUB ? ALVO_HUB : maquina.id;
    const aviso = maquina.ehMaquinaDoHub
      ? `Atualizar ${maquina.nome} tira o painel do ar por cerca de um minuto. Continuar?`
      : `Atualizar ${maquina.nome} para ${curto(shaEscolhido)}?`;
    if (!window.confirm(aviso)) return;

    vibrar(15);
    setEnviando(alvo);
    try {
      await apiPost(ROTAS.atualizar, { alvo, sha: shaEscolhido });
      await carregar();
    } catch {
      // erro já virou toast
    } finally {
      setEnviando(null);
    }
  }

  if (!dados) return <p className="painel__vazio">Carregando versões…</p>;

  const escolhida = dados.disponiveis.find((v) => v.sha === shaEscolhido);

  return (
    <div className="versoes">
      <section className="versoes__alvo">
        <h2 className="versoes__titulo">Versão a instalar</h2>
        <select
          className="versoes__select"
          value={shaEscolhido}
          onChange={(evento) => setShaEscolhido(evento.target.value)}
        >
          {dados.disponiveis.map((versao) => (
            <option key={versao.sha} value={versao.sha}>
              {curto(versao.sha)}
              {versao.aprovada ? ' (aprovada)' : ''} — {versao.notas}
            </option>
          ))}
        </select>
        {escolhida?.aprovada ? (
          <p className="versoes__dica">Esta é a versão aprovada para as igrejas.</p>
        ) : (
          <p className="versoes__dica versoes__dica--alerta">
            Atenção: esta não é a versão aprovada. Use em ensaio, não em dia de culto.
          </p>
        )}
        {dados.avisoRede ? <p className="versoes__dica versoes__dica--alerta">{dados.avisoRede}</p> : null}
      </section>

      <section className="versoes__maquinas">
        {dados.maquinas.map((maquina) => {
          const igual = maquina.sha !== null && maquina.sha === shaEscolhido;
          const ocupada = estaAtualizando(maquina);
          const estado = rotuloEstado(maquina);
          return (
            <article key={maquina.id} className="cartao-versao">
              <header className="cartao-versao__cabecalho">
                <h3>
                  {maquina.nome}
                  {maquina.ehMaquinaDoHub ? <span className="cartao-versao__marca">painel</span> : null}
                </h3>
                <span className={`cartao-versao__sha${igual ? ' cartao-versao__sha--ok' : ''}`}>
                  {curto(maquina.sha)}
                </span>
              </header>

              <p className="cartao-versao__notas">{maquina.notas || 'versão desconhecida'}</p>
              {estado ? <p className="cartao-versao__estado">{estado}</p> : null}
              {!maquina.online ? <p className="cartao-versao__estado">Máquina offline.</p> : null}

              <button
                type="button"
                className="botao-acao"
                disabled={igual || ocupada || !maquina.online || enviando !== null || !shaEscolhido}
                onClick={() => void atualizar(maquina)}
              >
                {igual ? 'Já está nesta versão' : ocupada ? 'Atualizando…' : 'Atualizar esta máquina'}
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
