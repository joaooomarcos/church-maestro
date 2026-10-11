import { describe, it, expect } from 'vitest';
import { aplicativosAbertos, temJanelaPrincipal } from './processos.js';

/**
 * Nomes tirados de um PC da igreja (NDI 5 Tools, Office 16). O NDI não usa o
 * nome da pasta no executável, e o Screen Capture ainda se chama ScanConverter.
 */
describe('aplicativosAbertos', () => {
  it('reconhece o NDI Tools pelos nomes reais dos processos', () => {
    const abertos = aplicativosAbertos([
      'Application.Network.ScanConverter2.x64',
      'Application.Network.StudioMonitor.x64',
    ]);
    expect(abertos['ndi-screen-capture']).toBe(true);
    expect(abertos['ndi-studio-monitor']).toBe(true);
    expect(abertos.powerpoint).toBe(false);
  });

  it('reconhece como o tasklist devolve, com .exe e maiúsculas', () => {
    const abertos = aplicativosAbertos(['POWERPNT.EXE', 'obs64.exe', 'Holyrics.exe']);
    expect(abertos).toMatchObject({ powerpoint: true, obs: true, holyrics: true });
  });

  it('reconhece o RustDesk', () => {
    expect(aplicativosAbertos(['rustdesk.exe']).rustdesk).toBe(true);
    expect(aplicativosAbertos(['obs64.exe']).rustdesk).toBe(false);
  });

  it('RustDesk só conta como aberto com a janela principal (processo sem argumentos)', () => {
    const exe = '"C:\\Program Files\\RustDesk\\RustDesk.exe"';
    // Serviço e --server (linha vazia), bandeja e uma conexão em andamento: nada de janela.
    expect(temJanelaPrincipal(['', '', `${exe}  --tray`, `${exe} --cm`])).toBe(false);
    expect(temJanelaPrincipal(['', `${exe}`, `${exe}  --tray`])).toBe(true);
    expect(temJanelaPrincipal(['C:\\RustDesk\\rustdesk.exe'])).toBe(true);
    expect(temJanelaPrincipal([])).toBe(false);
  });

  it('não confunde Studio Monitor com Screen Capture', () => {
    const abertos = aplicativosAbertos(['Application.Network.StudioMonitor.x64']);
    expect(abertos['ndi-screen-capture']).toBe(false);
  });
});
