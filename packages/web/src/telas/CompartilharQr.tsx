import { useState } from 'react';
import QRCode from 'qrcode';
import { ROTAS } from '@maestro/shared';
import { apiGet } from '../nucleo/cliente';

/** QR e link da área de transferência, para quem quer passar algo do celular ao PC. */
export function CompartilharQr() {
  const [url, setUrl] = useState('');
  const [imagemQr, setImagemQr] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function mostrar(): Promise<void> {
    if (carregando) return;
    setCarregando(true);
    try {
      const resposta = await apiGet<{ url: string }>(ROTAS.compartilharLink);
      setUrl(resposta.url);
      setImagemQr(await QRCode.toDataURL(resposta.url, { width: 320, margin: 1 }));
    } catch {
      // erro já virou toast
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="versoes__alvo">
      <h2 className="versoes__titulo">Compartilhar links e arquivos</h2>
      {url && imagemQr ? (
        <div className="convite">
          <img className="convite__qr" src={imagemQr} alt="QR code da área de compartilhar" />
          <a className="convite__link" href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
          <p className="versoes__dica">
            Qualquer um na rede da igreja abre, cola um link ou arquivo e pega em outro aparelho.
            Colar de novo substitui; reiniciar o painel apaga.
          </p>
        </div>
      ) : (
        <button type="button" className="botao-acao" disabled={carregando} onClick={() => void mostrar()}>
          {carregando ? 'Carregando…' : 'Mostrar QR code'}
        </button>
      )}
    </section>
  );
}
