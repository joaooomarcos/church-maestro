import { useState } from 'react';
import { AppProvider, useAppContexto } from './contexto/AppContext';
import { FaixaReconectando } from './componentes/FaixaReconectando';
import { Toasts } from './componentes/Toasts';
import { TelaPin } from './componentes/TelaPin';
import { Abas, type AbaId } from './componentes/Abas';
import { Painel } from './telas/Painel';
import { Ndi } from './telas/Ndi';
import { Holyrics } from './telas/Holyrics';
import { PowerPoint } from './telas/PowerPoint';
import { Testes } from './telas/Testes';
import { Versoes } from './telas/Versoes';

function ConteudoPrincipal() {
  const { autenticado, reconectando, controlesRodape } = useAppContexto();
  const [aba, setAba] = useState<AbaId>('painel');

  if (autenticado === null) {
    return <div className="carregando">Carregando…</div>;
  }

  if (!autenticado) {
    return (
      <>
        <Toasts />
        <TelaPin />
      </>
    );
  }

  return (
    <div className="app">
      {reconectando ? <FaixaReconectando /> : null}
      <Toasts />
      <header className="app__cabecalho">
        <span className="app__logo">Maestro</span>
      </header>
      <main className="app__conteudo">
        {aba === 'painel' && <Painel />}
        {aba === 'ndi' && <Ndi />}
        {aba === 'holyrics' && <Holyrics />}
        {aba === 'powerpoint' && <PowerPoint />}
        {aba === 'testes' && <Testes />}
        {aba === 'versoes' && <Versoes />}
      </main>
      <footer className="app__rodape">
        {controlesRodape ? <div className="controles-contextuais">{controlesRodape}</div> : null}
        <Abas atual={aba} aoSelecionar={setAba} />
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ConteudoPrincipal />
    </AppProvider>
  );
}
