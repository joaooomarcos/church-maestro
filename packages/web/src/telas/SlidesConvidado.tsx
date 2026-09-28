import { useState } from 'react';
import QRCode from 'qrcode';
import { ROTAS, type RespostaLinkConvidado } from '@maestro/shared';
import { useAppContexto } from '../contexto/AppContext';
import { apiPost } from '../nucleo/cliente';

/**
 * QR code para quem vai apresentar. A pessoa escaneia, digita o PIN de
 * convidado e passa os slides da máquina escolhida — sem PIN da equipe e sem
 * acesso ao resto do painel.
 */
export function SlidesConvidado() {
  const { snapshot } = useAppContexto();
  const maquinas = snapshot?.dispositivos ?? [];
  const [dispositivo, setDispositivo] = useState('');
  const [link, setLink] = useState<RespostaLinkConvidado | null>(null);
  const [imagemQr, setImagemQr] = useState('');
  const [gerando, setGerando] = useState(false);
  const [pinNovo, setPinNovo] = useState('');
  const [salvandoPin, setSalvandoPin] = useState(false);

  const controlaveis = maquinas;
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
