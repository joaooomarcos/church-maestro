import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './estilos.css';

const elemento = document.getElementById('root');
if (!elemento) throw new Error('Elemento #root não encontrado.');

createRoot(elemento).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
