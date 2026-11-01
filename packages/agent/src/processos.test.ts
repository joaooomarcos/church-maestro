import { describe, it, expect } from 'vitest';
import { aplicativosAbertos, refinarSoPrincipal, type ConsultaPrincipal } from './processos.js';

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

  it('não confunde Studio Monitor com Screen Capture', () => {
    const abertos = aplicativosAbertos(['Application.Network.StudioMonitor.x64']);
    expect(abertos['ndi-screen-capture']).toBe(false);
  });
});

/**
 * O RustDesk tem um processo de serviço que roda sempre. Conta como aberto
 * qualquer processo principal (janela, bandeja ou conexão); a consulta vem do
 * acoes.ps1 (-Acao rodando -SoPrincipal), que deixa o serviço de fora.
 */
describe('refinarSoPrincipal (RustDesk)', () => {
  const comRustdesk = aplicativosAbertos(['rustdesk.exe']);

  it('só serviço (consulta sem processo principal) = fechado', async () => {
    const consultar: ConsultaPrincipal = async () => false;
    expect((await refinarSoPrincipal(comRustdesk, consultar)).rustdesk).toBe(false);
  });

  it('com bandeja, conexão ou janela (consulta com principal) = aberto', async () => {
    const consultar: ConsultaPrincipal = async () => true;
    expect((await refinarSoPrincipal(comRustdesk, consultar)).rustdesk).toBe(true);
  });

  it('sem resposta da consulta, vale o que o nome do processo disse', async () => {
    const consultar: ConsultaPrincipal = async () => null;
    expect((await refinarSoPrincipal(comRustdesk, consultar)).rustdesk).toBe(true);
  });

  it('sem processo nenhum não consulta a janela', async () => {
    const perguntas: string[] = [];
    const consultar: ConsultaPrincipal = async (app) => {
      perguntas.push(app);
      return true;
    };
    const resultado = await refinarSoPrincipal(aplicativosAbertos([]), consultar);
    expect(resultado.rustdesk).toBe(false);
    expect(perguntas).toEqual([]);
  });

  it('não mexe nos outros programas', async () => {
    const abertos = aplicativosAbertos(['rustdesk.exe', 'obs64.exe']);
    const consultar: ConsultaPrincipal = async () => false;
    const resultado = await refinarSoPrincipal(abertos, consultar);
    expect(resultado).toMatchObject({ rustdesk: false, obs: true });
  });
});
