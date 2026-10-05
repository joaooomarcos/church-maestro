import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ALVO_HUB,
  ROTAS,
  type MaquinaVersao,
  type RespostaVersoes,
} from '@maestro/shared';
import { apiGet, apiPost } from '../nucleo/cliente';
import { vibrar } from '../nucleo/vibrar';

const INTERVALO_NORMAL_MS = 15_000;
/** Durante uma atualização a tela acompanha de perto o que a máquina responde. */
const INTERVALO_ATUALIZANDO_MS = 4000;

function curto(sha: string | null): string {
  return sha ? sha.slice(0, 7) : '—';
}

/** "0.2.0"; um commit que não é versão liberada aparece pelo hash, para dar para reconhecer. */
function nomeDaVersao(maquina: MaquinaVersao): string {
  if (maquina.versao) return maquina.versao;
  return maquina.sha ? `sem número · ${curto(maquina.sha)}` : '—';
}

function estaAtualizando(maquina: MaquinaVersao): boolean {
  const estado = maquina.atualizacao?.estado;
  return estado === 'baixando' || estado === 'compilando' || estado === 'trocando';
}

/** As etapas que o atualizador informa, na ordem. A primeira é o pedido, antes de a máquina responder. */
const ETAPAS = [
  { rotulo: 'Pedido' },
  { rotulo: 'Baixando', estado: 'baixando' },
  { rotulo: 'Compilando', estado: 'compilando' },
  { rotulo: 'Reiniciando', estado: 'trocando' },
] as const;

/** Em que etapa a máquina está; null se não há atualização em andamento. */
function etapaAtual(maquina: MaquinaVersao, pedidoAgora: boolean): number | null {
  const indice = ETAPAS.findIndex((etapa) => 'estado' in etapa && etapa.estado === maquina.atualizacao?.estado);
  if (indice >= 0) return indice;
  return maquina.alvoSha || pedidoAgora ? 0 : null;
}

function haQuanto(desde: number | undefined): string | null {
  if (!desde) return null;
  const segundos = Math.max(0, Math.round((Date.now() - desde) / 1000));
  if (segundos < 60) return `${segundos} s`;
  return `${Math.floor(segundos / 60)} min ${segundos % 60} s`;
}

/** Logo depois de terminar, o cartão diz que deu certo em vez de simplesmente voltar ao normal. */
const RECEM_ATUALIZADA_MS = 3 * 60_000;

function recemAtualizada(maquina: MaquinaVersao): boolean {
  const atualizacao = maquina.atualizacao;
  return atualizacao?.estado === 'ok' && Date.now() - atualizacao.ts < RECEM_ATUALIZADA_MS;
}

function mensagemDeFalha(maquina: MaquinaVersao): string | null {
  const atualizacao = maquina.atualizacao;
  if (atualizacao?.estado !== 'falhou') return null;
  return atualizacao.mensagem || 'A última atualização falhou.';
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
    const alguemAtualizando = dados?.maquinas.some((m) => estaAtualizando(m) || m.alvoSha) ?? false;
    const intervalo = alguemAtualizando ? INTERVALO_ATUALIZANDO_MS : INTERVALO_NORMAL_MS;
    timer.current = window.setTimeout(() => void carregar(), intervalo);
    return () => window.clearTimeout(timer.current);
  }, [dados, carregar]);

  const escolhida = dados?.disponiveis.find((v) => v.sha === shaEscolhido);

  async function atualizar(maquina: MaquinaVersao): Promise<void> {
    if (!shaEscolhido || enviando) return;
    const alvo = maquina.id === ALVO_HUB ? ALVO_HUB : maquina.id;
    const aviso = maquina.ehMaquinaDoHub
      ? `Atualizar ${maquina.nome} tira o painel do ar por cerca de um minuto. Continuar?`
      : `Atualizar ${maquina.nome} para a versão ${escolhida?.versao ?? curto(shaEscolhido)}?`;
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
              {versao.versao}
              {versao.aprovada ? ' (aprovada)' : ''} — {versao.notas}
            </option>
          ))}
        </select>
        {dados.disponiveis.length === 0 ? (
          <p className="versoes__dica">Nenhuma versão liberada ainda.</p>
        ) : escolhida?.aprovada ? (
          <p className="versoes__dica">Esta é a versão aprovada para as igrejas.</p>
        ) : (
          <p className="versoes__dica versoes__dica--alerta">
            Atenção: esta não é a versão aprovada. Use para voltar atrás se a nova deu problema.
          </p>
        )}
        {dados.avisoRede ? <p className="versoes__dica versoes__dica--alerta">{dados.avisoRede}</p> : null}
      </section>

      <section className="versoes__maquinas">
        {dados.maquinas.map((maquina) => {
          const igual = maquina.sha !== null && maquina.sha === shaEscolhido;
          const alvo = maquina.id === ALVO_HUB ? ALVO_HUB : maquina.id;
          const pedindo = enviando === alvo;
          const etapa = etapaAtual(maquina, pedindo);
          const ocupada = etapa !== null;
          const falha = ocupada ? null : mensagemDeFalha(maquina);
          const decorrido = haQuanto(maquina.pedidoEm);
          return (
            <article key={maquina.id} className="cartao-versao">
              <header className="cartao-versao__cabecalho">
                <h3>
                  {maquina.nome}
                  {maquina.ehMaquinaDoHub ? <span className="cartao-versao__marca">painel</span> : null}
                </h3>
                <span className={`cartao-versao__sha${igual ? ' cartao-versao__sha--ok' : ''}`}>
                  {nomeDaVersao(maquina)}
                </span>
              </header>

              <p className="cartao-versao__notas">
                {maquina.notas || 'versão desconhecida'}
                {maquina.ultimaConhecida ? ' (última versão vista antes de sair do ar)' : ''}
              </p>

              {etapa !== null ? (
                <div className="progresso-versao" role="status" aria-live="polite">
                  <ol className="progresso-versao__etapas">
                    {ETAPAS.map((passo, indice) => (
                      <li
                        key={passo.rotulo}
                        className={`progresso-versao__etapa${
                          indice < etapa
                            ? ' progresso-versao__etapa--feita'
                            : indice === etapa
                              ? ' progresso-versao__etapa--atual'
                              : ''
                        }`}
                        aria-current={indice === etapa ? 'step' : undefined}
                      >
                        <span className="progresso-versao__barra" />
                        <span className="progresso-versao__rotulo">{passo.rotulo}</span>
                      </li>
                    ))}
                  </ol>
                  <p className="progresso-versao__detalhe">
                    {maquina.alvoSha ? `Instalando ${curto(maquina.alvoSha)}` : 'Enviando o pedido'}
                    {decorrido ? ` · há ${decorrido}` : ''}
                    {maquina.atualizacao?.mensagem && estaAtualizando(maquina) ? ` · ${maquina.atualizacao.mensagem}` : ''}
                  </p>
                </div>
              ) : null}
              {falha ? <p className="cartao-versao__estado cartao-versao__estado--falha">{falha}</p> : null}
              {!ocupada && !falha && recemAtualizada(maquina) ? (
                <p className="cartao-versao__estado cartao-versao__estado--ok">Atualização concluída.</p>
              ) : null}
              {!maquina.online && !ocupada ? <p className="cartao-versao__estado">Máquina offline.</p> : null}

              <button
                type="button"
                className={`botao-acao${ocupada ? ' botao-acao--carregando' : ''}`}
                disabled={igual || ocupada || !maquina.online || enviando !== null || !shaEscolhido}
                aria-busy={ocupada}
                onClick={() => void atualizar(maquina)}
              >
                {ocupada ? <span className="controle-apps__espera" aria-hidden="true" /> : null}
                {ocupada ? 'Atualizando…' : igual ? 'Já está nesta versão' : 'Atualizar esta máquina'}
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
