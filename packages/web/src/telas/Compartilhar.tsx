import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LIMITE_ARQUIVO_BYTES,
  ROTAS,
  type ErroApi,
  type ItemCompartilhado,
} from '@maestro/shared';
import { Icone } from '../componentes/Icone';
import { vibrar } from '../nucleo/vibrar';

/** O PC de quem vai pegar vê o que o celular acabou de colar sem recarregar. */
const INTERVALO_MS = 3000;

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function horario(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function ehLink(texto: string): boolean {
  return /^https?:\/\/\S+$/i.test(texto.trim());
}

/**
 * `navigator.clipboard` só existe em HTTPS ou localhost — e esta página roda em
 * http://<ip-do-hub>. O `execCommand` é antigo, mas é o que funciona aí.
 */
async function copiarParaAreaDeTransferencia(texto: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // segue para o caminho antigo
    }
  }
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  campo.setSelectionRange(0, texto.length);
  let copiou = false;
  try {
    copiou = document.execCommand('copy');
  } catch {
    copiou = false;
  }
  document.body.removeChild(campo);
  return copiou;
}

async function mensagemDeErro(resposta: Response, padrao: string): Promise<string> {
  const corpo = (await resposta.json().catch(() => null)) as Partial<ErroApi> | null;
  return corpo?.mensagem ?? padrao;
}

/**
 * Área de transferência da igreja: cole aqui no celular, pegue no PC (ou o
 * contrário). Um item só, aberta para a rede — não é lugar de senha.
 */
export function Compartilhar() {
  const [item, setItem] = useState<ItemCompartilhado>(null);
  const [carregado, setCarregado] = useState(false);
  const [texto, setTexto] = useState('');
  const [progresso, setProgresso] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const campoTexto = useRef<HTMLTextAreaElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await fetch(ROTAS.compartilhar, { cache: 'no-store' });
      if (!resposta.ok) return;
      const dados = (await resposta.json()) as { item: ItemCompartilhado };
      setItem(dados.item);
    } catch {
      // sem rede agora: a próxima volta tenta de novo
    } finally {
      setCarregado(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const timer = window.setInterval(() => void carregar(), INTERVALO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  function avisar(mensagem: string): void {
    setErro(null);
    setAviso(mensagem);
    window.setTimeout(() => setAviso((atual) => (atual === mensagem ? null : atual)), 3000);
  }

  async function copiar(): Promise<void> {
    if (item?.tipo !== 'texto') return;
    vibrar(15);
    if (await copiarParaAreaDeTransferencia(item.texto)) {
      avisar('Copiado.');
    } else {
      campoTexto.current?.select();
      setErro('Não deu para copiar sozinho. O texto ficou selecionado: copie à mão.');
    }
  }

  async function enviarTexto(): Promise<void> {
    const conteudo = texto.trim();
    if (!conteudo || ocupado) return;
    vibrar(15);
    setOcupado(true);
    setErro(null);
    try {
      const resposta = await fetch(ROTAS.compartilharTexto, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto: conteudo }),
      });
      if (!resposta.ok) {
        setErro(await mensagemDeErro(resposta, 'Não consegui enviar o texto.'));
        return;
      }
      setItem(((await resposta.json()) as { item: ItemCompartilhado }).item);
      setTexto('');
      avisar('Enviado. Já dá para pegar em outro aparelho.');
    } catch {
      setErro('Sem conexão com o painel. Confira se está no wi-fi da igreja.');
    } finally {
      setOcupado(false);
    }
  }

  function enviarArquivo(arquivo: File): void {
    if (arquivo.size > LIMITE_ARQUIVO_BYTES) {
      setErro(`"${arquivo.name}" tem ${formatarTamanho(arquivo.size)}. O limite é 100 MB.`);
      return;
    }
    vibrar(15);
    setErro(null);
    setOcupado(true);
    setProgresso(0);

    // XHR em vez de fetch: é o único jeito de mostrar o progresso do envio.
    const envio = new XMLHttpRequest();
    envio.open('POST', ROTAS.compartilharArquivo);
    envio.setRequestHeader('Content-Type', 'application/octet-stream');
    envio.setRequestHeader('x-nome-arquivo', encodeURIComponent(arquivo.name));
    envio.upload.onprogress = (evento) => {
      if (evento.lengthComputable) setProgresso(evento.loaded / evento.total);
    };
    envio.onload = () => {
      setOcupado(false);
      setProgresso(null);
      let corpo: { item?: ItemCompartilhado; mensagem?: string } = {};
      try {
        corpo = JSON.parse(envio.responseText) as typeof corpo;
      } catch {
        // resposta sem JSON
      }
      if (envio.status >= 200 && envio.status < 300 && corpo.item !== undefined) {
        setItem(corpo.item);
        avisar('Arquivo enviado. Já dá para baixar em outro aparelho.');
      } else {
        setErro(corpo.mensagem ?? 'Não consegui enviar o arquivo.');
      }
    };
    envio.onerror = () => {
      setOcupado(false);
      setProgresso(null);
      setErro('O envio caiu. Confira o wi-fi e tente de novo.');
    };
    envio.send(arquivo);
  }

  async function apagar(): Promise<void> {
    if (!window.confirm('Apagar o que está compartilhado agora?')) return;
    try {
      await fetch(ROTAS.compartilhar, { method: 'DELETE' });
      setItem(null);
    } catch {
      setErro('Sem conexão com o painel.');
    }
  }

  return (
    <div className="compartilhar">
      <header className="compartilhar__cabecalho">
        <h1 className="convidado__titulo">Compartilhar</h1>
        <p className="convidado__ajuda">Cole aqui para pegar em outro aparelho da igreja.</p>
      </header>

      <section className="versoes__alvo compartilhar__bloco">
        <h2 className="versoes__titulo">O que está aqui agora</h2>

        {!carregado ? (
          <p className="convidado__ajuda">Carregando…</p>
        ) : item === null ? (
          <p className="convidado__ajuda">Nada compartilhado ainda.</p>
        ) : item.tipo === 'texto' ? (
          <>
            <textarea
              ref={campoTexto}
              className="compartilhar__texto"
              readOnly
              value={item.texto}
              rows={Math.min(8, Math.max(2, item.texto.split('\n').length))}
            />
            <p className="versoes__dica">Colado às {horario(item.criadoEm)}</p>
            <div className="compartilhar__acoes">
              <button type="button" className="botao-acao compartilhar__botao" onClick={() => void copiar()}>
                <Icone nome="copiar" tamanho={20} /> Copiar
              </button>
              {ehLink(item.texto) ? (
                <a
                  className="botao-acao compartilhar__botao"
                  href={item.texto.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Icone nome="link" tamanho={20} /> Abrir
                </a>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="compartilhar__arquivo">{item.nome}</p>
            <p className="versoes__dica">
              {formatarTamanho(item.tamanho)} · enviado às {horario(item.criadoEm)}
            </p>
            <a className="botao-acao compartilhar__botao" href={ROTAS.compartilharArquivo} download={item.nome}>
              <Icone nome="baixar" tamanho={20} /> Baixar
            </a>
          </>
        )}

        {item !== null ? (
          <button type="button" className="compartilhar__apagar" onClick={() => void apagar()}>
            <Icone nome="lixo" tamanho={18} /> Apagar
          </button>
        ) : null}
      </section>

      <section className="versoes__alvo compartilhar__bloco">
        <h2 className="versoes__titulo">Colar algo novo</h2>
        <textarea
          className="compartilhar__texto"
          placeholder="Cole um link ou um texto"
          rows={3}
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
        />
        <button
          type="button"
          className="botao-acao compartilhar__botao"
          disabled={!texto.trim() || ocupado}
          onClick={() => void enviarTexto()}
        >
          <Icone nome="enviar" tamanho={20} /> Enviar texto
        </button>

        <label className={`botao-acao compartilhar__botao${ocupado ? ' compartilhar__botao--desligado' : ''}`}>
          <Icone nome="compartilhar" tamanho={20} /> Enviar arquivo
          <input
            type="file"
            className="compartilhar__arquivo-campo"
            disabled={ocupado}
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              evento.target.value = '';
              if (arquivo) enviarArquivo(arquivo);
            }}
          />
        </label>

        {progresso !== null ? (
          <div className="compartilhar__progresso" role="progressbar" aria-valuenow={Math.round(progresso * 100)}>
            <div className="compartilhar__progresso-barra" style={{ width: `${Math.round(progresso * 100)}%` }} />
          </div>
        ) : null}

        <p className="versoes__dica">Colar algo novo substitui o que está lá. Arquivos de até 100 MB.</p>
      </section>

      {aviso ? <p className="compartilhar__ok">{aviso}</p> : null}
      {erro ? <p className="convidado__erro">{erro}</p> : null}

      <p className="compartilhar__aviso">
        Tudo aqui é visível para quem está na rede da igreja, e some quando o painel reinicia. Não
        coloque senhas.
      </p>
    </div>
  );
}
