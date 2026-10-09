import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispositivoDaFonteNdi, maquinaDaFonteNdi, type DispositivoConfig, type ResultadoCheck } from '@maestro/shared';
import { checarNdi } from './ndi.js';
import type { ContextoCheck } from './tipos.js';
import type { Drivers } from '../drivers/tipos.js';
import { criarDriversMock, dispositivosDemo } from '../drivers/mock.js';

/**
 * Os testes rodam sobre o mock, que de propósito cobre ✓, ✗ e ⚠ em janelas
 * diferentes: PC Transmissão 80 (parecido), PC Fundo 80 (diferente), PC
 * Transmissão 81 (origem com tela preta), PC Fundo 81 (origem fora do painel) e
 * PC Transmissão 82 (sem monitor informado).
 */

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

function preparar(dispositivos: DispositivoConfig[] = dispositivosDemo()): { ctx: ContextoCheck; drivers: Drivers } {
  const drivers = criarDriversMock();
  return { ctx: { drivers, dispositivos: () => dispositivos }, drivers };
}

const passo = (r: ResultadoCheck, id: string) => r.passos.find((p) => p.id === id);

describe('checarNdi', () => {
  it('cobre parecido, diferente, inconclusivo e fora do painel, cada um na sua janela', async () => {
    const { ctx } = preparar();
    const r = await checarNdi(ctx);

    const parecido = passo(r, 'imagem-pc-transmissao-80');
    expect(parecido?.status).toBe('ok');
    expect(parecido?.imagens?.map((i) => i.rotulo)).toEqual([
      'Origem · Note Frente (tela 1)',
      'Destino · PC Transmissão (tela 2)',
    ]);
    expect(parecido?.imagens?.[0]?.dataUrl).toMatch(/^data:image\/svg\+xml;base64,/);

    const diferente = passo(r, 'imagem-pc-fundo-80');
    expect(diferente?.status).toBe('falha');
    expect(diferente?.detalhe).toBe('A janela do PC Fundo não está mostrando o Note Frente: as duas telas são muito diferentes.');
    expect(diferente?.imagens).toHaveLength(2);

    const lisa = passo(r, 'imagem-pc-transmissao-81');
    expect(lisa?.status).toBe('aviso');
    expect(lisa?.comoResolver).toMatch(/bloqueada ou apagada/);
    expect(lisa?.imagens).toHaveLength(2);

    const fora = passo(r, 'imagem-pc-fundo-81');
    expect(fora?.status).toBe('aviso');
    expect(fora?.detalhe).toMatch(/não é uma máquina do painel/);
    expect(fora?.imagens).toHaveLength(1);

    expect(r.status).toBe('falha');
  });

  it('janela sem monitor configurado avisa onde informar, mas o passo da fonte roda', async () => {
    const { ctx } = preparar();
    const r = await checarNdi(ctx);
    expect(passo(r, 'monitor-pc-transmissao-82')?.status).toBe('ok');
    const semMonitor = passo(r, 'imagem-pc-transmissao-82');
    expect(semMonitor?.status).toBe('aviso');
    expect(semMonitor?.comoResolver).toBe('Informe em Ajustes › NDI o monitor desta janela.');
    expect(semMonitor?.imagens).toBeUndefined();
  });

  it('máquina de origem offline falha com "ligue" e o teste segue com as outras janelas', async () => {
    const { ctx, drivers } = preparar();
    const ler = drivers.agente.ler.bind(drivers.agente);
    drivers.agente.ler = async (d, op) =>
      d.id === 'note-frente'
        ? { online: false, erro: 'O agente do Note Frente não respondeu.', processos: {}, emPrimeiroPlano: null, capacidades: [] }
        : ler(d, op);

    const r = await checarNdi(ctx);
    const caiu = passo(r, 'imagem-pc-transmissao-80');
    expect(caiu?.status).toBe('falha');
    expect(caiu?.comoResolver).toBe('Ligue o Note Frente e confira se o Maestro (o agente) está aberto nele.');
    // As demais janelas continuam sendo avaliadas.
    expect(passo(r, 'imagem-pc-transmissao-81')?.status).toBe('aviso');
    expect(passo(r, 'imagem-pc-fundo-80')?.status).toBe('falha');
  });

  it('máquina de destino offline falha pedindo para ligar o destino', async () => {
    const { ctx, drivers } = preparar();
    const ler = drivers.agente.ler.bind(drivers.agente);
    drivers.agente.ler = async (d, op) =>
      d.id === 'pc-fundo'
        ? { online: false, erro: 'sem resposta', processos: {}, emPrimeiroPlano: null, capacidades: [] }
        : ler(d, op);
    const r = await checarNdi(ctx);
    expect(passo(r, 'imagem-pc-fundo-80')?.comoResolver).toMatch(/^Ligue o PC Fundo/);
  });

  it('fonte que sumiu da rede continua falhando no passo 1 e não ganha o passo da imagem', async () => {
    const { ctx, drivers } = preparar();
    await drivers.ndi.definirFonte('192.168.0.20', 80, 'OUTRA-MAQUINA (Screen Capture)');
    const lerNdi = drivers.ndi.ler.bind(drivers.ndi);
    drivers.ndi.ler = async (host, porta, op) => {
      const estado = await lerNdi(host, porta, op);
      return host === '192.168.0.20' && porta === 80 ? { ...estado, fontesDisponiveis: ['PC-FUNDO (Screen Capture)'] } : estado;
    };
    const r = await checarNdi(ctx);
    const p = passo(r, 'monitor-pc-transmissao-80');
    expect(p?.status).toBe('falha');
    expect(p?.detalhe).toMatch(/A tela deve estar preta/);
    expect(passo(r, 'imagem-pc-transmissao-80')).toBeUndefined();
  });

  it('sem Studio Monitor em nenhuma máquina, orienta o assistente (não a tela Dispositivos)', async () => {
    const semNdi = dispositivosDemo().map((d) => ({ ...d, servicos: { ...d.servicos, ndiMonitor: undefined } }));
    const { ctx } = preparar(semNdi);
    const r = await checarNdi(ctx);
    expect(r.status).toBe('falha');
    expect(r.passos[0]?.comoResolver).toMatch(/assistente de instalação/);
    expect(JSON.stringify(r)).not.toMatch(/Em Dispositivos/);
  });
});

describe('dispositivoDaFonteNdi', () => {
  it('acha a máquina pelo nome da fonte, pelo id, pelo nome ou pelo hostname', () => {
    const dispositivos = dispositivosDemo();
    expect(maquinaDaFonteNdi('NOTE-FRENTE (Screen Capture)')).toBe('NOTE-FRENTE');
    expect(dispositivoDaFonteNdi('NOTE-FRENTE (Screen Capture)', dispositivos)?.id).toBe('note-frente');
    expect(dispositivoDaFonteNdi('PC-LIVE (Screen Capture)', dispositivos)).toBeNull();
    expect(
      dispositivoDaFonteNdi('DESKTOP-9X (Screen Capture)', dispositivos, (id) => (id === 'pc-fundo' ? 'DESKTOP-9X' : undefined))?.id,
    ).toBe('pc-fundo');
  });
});
