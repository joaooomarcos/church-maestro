import type { Monitor } from '@maestro/shared';

/** "\\.\DISPLAY2" vira "Tela 2", que é o número que o Windows mostra em Configurações › Tela. */
export function nomeDoMonitor(monitor: Monitor): string {
  const numero = /DISPLAY(\d+)/i.exec(monitor.id)?.[1];
  const nome = numero ? `Tela ${numero}` : monitor.id;
  return `${nome} · ${monitor.largura}×${monitor.altura}${monitor.principal ? ' (principal)' : ''}`;
}
