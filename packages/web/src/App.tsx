import { useState } from 'react';
import { AppProvider, useAppContexto, useSlotsLayout } from './contexto/AppContext';
import { FaixaReconectando } from './componentes/FaixaReconectando';
import { Toasts } from './componentes/Toasts';
import { AlertasEquipe } from './componentes/AlertasEquipe';
import { TelaPin } from './componentes/TelaPin';
import { Icone } from './componentes/Icone';
import { MenuLateral, tituloDaTela } from './componentes/MenuLateral';
import { Painel } from './telas/Painel';
import { PcDetalhe } from './telas/PcDetalhe';
import { Ndi } from './telas/Ndi';
import { Holyrics } from './telas/Holyrics';
import { PowerPoint } from './telas/PowerPoint';
import { Testes } from './telas/Testes';
import { Avisos } from './telas/Avisos';
import { Cenarios } from './telas/Cenarios';
import { Agendamentos } from './telas/Agendamentos';
import { SlidesConvidado } from './telas/SlidesConvidado';
import { CompartilharQr } from './telas/CompartilharQr';
import { Versoes } from './telas/Versoes';
import { Ajustes } from './telas/Ajustes';

function ConteudoPrincipal() {
  const { autenticado, reconectando, tela, abrirTela } = useAppContexto();
  const { controlesRodape, controlesCabecalho } = useSlotsLayout();
  const [menuAberto, setMenuAberto] = useState(false);

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
      <MenuLateral
        atual={tela}
        aberto={menuAberto}
        aoSelecionar={(nova) => {
          abrirTela(nova);
          setMenuAberto(false);
        }}
        aoFechar={() => setMenuAberto(false)}
      />
      <div className="app__corpo">
        {reconectando ? <FaixaReconectando /> : null}
        <Toasts />
        <AlertasEquipe />
        <header className="app__cabecalho">
          <button
            type="button"
            className="app__botao-menu"
            onClick={() => setMenuAberto(true)}
            aria-label="Abrir menu"
          >
            <Icone nome="menu" />
          </button>
          <h1 className="app__titulo">{tituloDaTela(tela)}</h1>
          {controlesCabecalho ? <div className="app__controles">{controlesCabecalho}</div> : null}
        </header>
        <main className="app__conteudo">
          {tela === 'painel' && <Painel />}
          {tela === 'maquinas' && <PcDetalhe />}
          {tela === 'ndi' && <Ndi />}
          {tela === 'holyrics' && <Holyrics />}
          {tela === 'powerpoint' && <PowerPoint />}
          {tela === 'testes' && <Testes />}
          {tela === 'avisos' && <Avisos />}
          {tela === 'cenarios' && <Cenarios />}
          {tela === 'agendamentos' && <Agendamentos />}
          {tela === 'convidado' && <SlidesConvidado />}
          {tela === 'compartilhar' && <CompartilharQr />}
          {tela === 'versoes' && <Versoes />}
          {tela === 'ajustes' && <Ajustes />}
        </main>
        {/* Só as telas de passar slide usam o rodapé: os botões grandes ficam perto do polegar. */}
        {controlesRodape ? (
          <footer className="app__rodape">
            <div className="controles-contextuais">{controlesRodape}</div>
          </footer>
        ) : null}
      </div>
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
