import type { ConfigAgente } from '@maestro/shared';
import { ErroApp, abrirUrlNoChrome, executarAcaoApp, temJanelaAberta } from '../apps/index.js';
import { mostrarAviso } from '../avisos/index.js';
import { holyricsLocal } from '../controle/solo.js';
import { trocarFonteNdi } from '../controle/ndiLocal.js';
import type { Memoria } from '../controle/memoria.js';
import type { DependenciasRotina } from './passos.js';

const SEM_HOLYRICS =
  'Esta máquina ainda não sabe o token do Holyrics. Ele chega pelo hub na primeira vez que ele estiver no ar com o Holyrics cadastrado.';

/** As ações de verdade: falam com o programa instalado nesta máquina. */
export function criarDependenciasReais(config: ConfigAgente, memoria: Memoria): DependenciasRotina {
  const holyrics = (): { porta: number; token: string } => {
    const dados = memoria.hub()?.holyrics;
    if (!dados) throw new ErroApp(SEM_HOLYRICS);
    return dados;
  };

  return {
    acaoApp: (app, acao) => executarAcaoApp(app, acao, config),
    aviso: (comando) => mostrarAviso(comando),
    ndi: (porta, fonte) => trocarFonteNdi(porta, fonte),
    abrirPagina: (url) => abrirUrlNoChrome(url),
    holyrics: (acao, corpo) => holyricsLocal(holyrics(), acao, corpo),
    // No Holyrics, o processo e a janela aparecem bem antes da API responder, e é a API que os passos usam.
    appPronto: async (app) => {
      if (app === 'holyrics' && memoria.hub()?.holyrics) {
        await holyricsLocal(holyrics(), 'GetCurrentPresentation');
        return true;
      }
      return temJanelaAberta(app);
    },
    dormir: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
    agora: () => Date.now(),
  };
}
