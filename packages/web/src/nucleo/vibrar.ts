/**
 * Feedback tátil ao toque. `navigator.vibrate` não existe em todo navegador
 * (Safari, por exemplo) — falha silenciosamente nesses casos.
 */
export function vibrar(padraoMs: number | number[] = 15): void {
  try {
    navigator.vibrate?.(padraoMs);
  } catch {
    // sem suporte — segue sem vibração.
  }
}
