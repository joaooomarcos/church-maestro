import { useEffect } from 'react';
import NoSleep from 'nosleep.js';

/**
 * Mantém a tela do celular acesa enquanto a tela de controle está aberta.
 *
 * O painel roda em http://<ip-do-hub>, e ali o navegador não oferece a API
 * oficial (Wake Lock, só em HTTPS). O NoSleep cai então no truque do vídeo
 * invisível tocando em laço, que funciona no Android e no iPhone — mas só pode
 * começar depois de um toque na tela. Por isso liga no primeiro toque e religa
 * no toque seguinte a cada volta para a página.
 */
export function useTelaAcesa(ativo: boolean = true): void {
  useEffect(() => {
    if (!ativo) return undefined;
    const noSleep = new NoSleep();

    const ligar = (): void => {
      if (noSleep.isEnabled || document.visibilityState !== 'visible') return;
      noSleep.enable().catch(() => {
        // o navegador recusou (sem toque ainda, economia de bateria): tenta no próximo toque.
      });
    };
    const aoMudarVisibilidade = (): void => {
      // Ao sair da página o sistema para o vídeo por conta própria: desliga para religar na volta.
      if (document.visibilityState === 'visible') ligar();
      else noSleep.disable();
    };

    ligar();
    document.addEventListener('pointerdown', ligar);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => {
      document.removeEventListener('pointerdown', ligar);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      noSleep.disable();
    };
  }, [ativo]);
}

/**
 * Chama `fn` quando a página volta a aparecer (celular desbloqueado, aba de
 * volta) ou quando o wi-fi retorna: é a hora de buscar o estado de novo, sem
 * esperar a próxima volta do relógio.
 */
export function useAoVoltar(fn: () => void): void {
  useEffect(() => {
    const aoMudarVisibilidade = (): void => {
      if (document.visibilityState === 'visible') fn();
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    window.addEventListener('pageshow', fn);
    window.addEventListener('online', fn);
    return () => {
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      window.removeEventListener('pageshow', fn);
      window.removeEventListener('online', fn);
    };
  }, [fn]);
}
