/**
 * Copia um texto. O painel abre por http no IP da rede, e aí o navegador não
 * oferece `navigator.clipboard` (só existe em https e localhost): cai para o
 * jeito antigo, com um campo escondido.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // tenta o jeito antigo
  }

  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  campo.setSelectionRange(0, texto.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    campo.remove();
  }
}
