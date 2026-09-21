import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ALVO_HUB,
  ROTAS,
  type RespostaLinkConvidado,
  type Ajustes as AjustesHub,
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

const INTERVALOS_HEARTBEAT = [5, 10, 20, 30, 60];

/** Ajustes da operação que valem para todas as máquinas. */
function Ajustes() {
  const [segundos, setSegundos] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    apiGet<AjustesHub>(ROTAS.ajustes)
      .then((ajustes) => setSegundos(Math.round(ajustes.intervaloHeartbeatMs / 1000)))
      .catch(() => {
        // erro já virou toast
      });
  }, []);

  async function salvar(novoEmSegundos: number): Promise<void> {
    const anterior = segundos;
    setSegundos(novoEmSegundos);
    setSalvando(true);
    try {
      await apiPost(ROTAS.ajustes, { intervaloHeartbeatMs: novoEmSegundos * 1000 });
    } catch {
      setSegundos(anterior);
    } finally {
      setSalvando(false);
    }
  }

  if (segundos === null) return null;

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Aviso de "estou viva"</h2>
      <select
        className="versoes__select"
        value={segundos}
        disabled={salvando}
        onChange={(evento) => void salvar(Number(evento.target.value))}
      >
        {INTERVALOS_HEARTBEAT.map((valor) => (
          <option key={valor} value={valor}>
            a cada {valor} segundos
          </option>
        ))}
      </select>
      <p className="versoes__dica">
        De quanto em quanto tempo cada máquina avisa o hub que está no ar. Vale para todas; um
        intervalo menor deixa o painel mais rápido em perceber uma queda.
      </p>
    </section>
  );
}

/**
 * QR code para quem vai apresentar. A pessoa escaneia, digita o PIN de
 * convidado e passa os slides da máquina escolhida — sem PIN da equipe e sem
 * acesso ao resto do painel.
 */
function Convite({ maquinas }: { maquinas: MaquinaVersao[] }) {
  const [dispositivo, setDispositivo] = useState('');
  const [link, setLink] = useState<RespostaLinkConvidado | null>(null);
  const [imagemQr, setImagemQr] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pinNovo, setPinNovo] = useState('');
  const [salvandoPin, setSalvandoPin] = useState(false);

  const controlaveis = maquinas.filter((maquina) => maquina.id !== ALVO_HUB);
  const escolhida = dispositivo || controlaveis[0]?.id || '';

  async function gerar(regerar: boolean): Promise<void> {
    if (!escolhida || gerando) return;
    setGerando(true);
    try {
      const resposta = await apiPost<RespostaLinkConvidado>(ROTAS.convidadoLink, {
        dispositivo: escolhida,
        regerar,
      });
      setLink(resposta);
      setImagemQr(await QRCode.toDataURL(resposta.url, { width: 320, margin: 1 }));
    } catch {
      // erro já virou toast
    } finally {
      setGerando(false);
    }
  }

  async function trocarPin(): Promise<void> {
    if (pinNovo.length < 4 || salvandoPin) return;
    setSalvandoPin(true);
    try {
      await apiPost(ROTAS.ajustes, { pinConvidado: pinNovo });
      setLink((atual) => (atual ? { ...atual, pin: pinNovo } : atual));
      setPinNovo('');
    } catch {
      // erro já virou toast
    } finally {
      setSalvandoPin(false);
    }
  }

  if (controlaveis.length === 0) return null;

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Controle para quem vai apresentar</h2>
      <select
        className="versoes__select"
        value={escolhida}
        onChange={(evento) => {
          setDispositivo(evento.target.value);
          setLink(null);
          setImagemQr('');
        }}
      >
        {controlaveis.map((maquina) => (
          <option key={maquina.id} value={maquina.id}>
            {maquina.nome}
          </option>
        ))}
      </select>

      {link && imagemQr ? (
        <div className="convite">
          <img className="convite__qr" src={imagemQr} alt={`QR code para ${link.nome}`} />
          <p className="convite__pin">
            PIN do convidado: <strong>{link.pin}</strong>
          </p>
          <p className="versoes__dica">
            A pessoa escaneia, digita esse PIN uma vez e passa os slides desta máquina. O acesso
            dura um dia.
          </p>

          <div className="convite__troca">
            <input
              className="convite__campo"
              type="tel"
              inputMode="numeric"
              placeholder="Novo PIN"
              value={pinNovo}
              onChange={(evento) => setPinNovo(evento.target.value.trim())}
            />
            <button
              type="button"
              className="controle-apps__acao"
              disabled={pinNovo.length < 4 || salvandoPin}
              onClick={() => void trocarPin()}
            >
              Trocar PIN
            </button>
          </div>

          <button type="button" className="controle-apps__acao" onClick={() => void gerar(true)}>
            Trocar o link (derruba os anteriores)
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="botao-acao"
          disabled={gerando}
          onClick={() => void gerar(false)}
        >
          {gerando ? 'Gerando…' : 'Mostrar QR code'}
        </button>
      )}
    </section>
  );
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
      <Ajustes />

      <Convite maquinas={dados.maquinas} />

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
