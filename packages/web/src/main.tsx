import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { Convidado } from './telas/Convidado';
import './estilos.css';

const elemento = document.getElementById('root');
if (!elemento) throw new Error('Elemento #root não encontrado.');

// /convidado/<token> é a página de quem vai apresentar: nada de painel, nada de
// sessão da equipe. O token identifica a máquina que o QR code apontava.
const convidado = /^\/convidado\/([0-9a-f]{8,})\/?$/i.exec(window.location.pathname);

createRoot(elemento).render(
  <StrictMode>{convidado?.[1] ? <Convidado token={convidado[1]} /> : <App />}</StrictMode>,
);
