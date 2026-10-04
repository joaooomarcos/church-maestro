import { describe, it, expect } from 'vitest';
import type { ComandoApp, ComandoAviso, DispositivoConfig, MensagemHub } from '@maestro/shared';
import { executarCenario } from './executar.js';
import { enviarAviso } from '../avisos/enviar.js';
import { criarContexto } from '../rotas/contexto.js';
import { Store } from '../estado/store.js';
import type { Drivers } from '../drivers/tipos.js';

function maquina(id: string, extra: Partial<DispositivoConfig> = {}): DispositivoConfig {
  return { id, nome: id.toUpperCase(), host: '10.0.0.1', fixarHost: false, servicos: { agente: { porta: 8770 } }, ...extra };
}

function montar(falhaEm?: string) {
  const avisos: { id: string; comando: ComandoAviso }[] = [];
  const apps: { id: string; comando: ComandoApp }[] = [];
  const mensagens: MensagemHub[] = [];
  const store = new Store();
  store.transmitirMensagem = (mensagem) => void mensagens.push(mensagem);
  const drivers = {
    agente: {
      async mostrarAviso(dispositivo, comando) {
        if (dispositivo.id === falhaEm) throw new Error('não respondeu');
        avisos.push({ id: dispositivo.id, comando });
      },
      async acaoApp(dispositivo, comando) {
        apps.push({ id: dispositivo.id, comando });
      },
    },
  } as Drivers;
  const ctx = criarContexto({
    config: {
      porta: 8700,
      pin: '1234',
      segredoSessao: 'x'.repeat(16),
      tokenAgentes: 'y'.repeat(16),
      intervaloHeartbeatMs: 10_000,
      pinConvidado: '4321',
      intervaloPollingMs: 2000,
      varreduraAutomaticaMin: 10,
    },
    drivers,
    store,
    cenarios: [],
    dispositivos: [maquina('transmissao', { monitorAvisos: '\\\\.\\DISPLAY2' }), maquina('fundo')],
    caminhoDispositivos: '',
    caminhoHub: '',
    persistir: false,
  });
  return { ctx, avisos, apps, mensagens };
}

describe('passos de aviso e de programa', () => {
  it('mostra o aviso no monitor escolhido de cada máquina e no painel', async () => {
    const { ctx, avisos, mensagens } = montar();
    const resultado = await executarCenario(ctx, {
      id: 'aviso',
      nome: 'Aviso',
      acoes: [{ tipo: 'aviso.mostrar', dispositivos: ['transmissao', 'fundo'], mensagem: 'Faltam 10 minutos', noPainel: true, monitores: {}, segundos: null }],
    });

    expect(resultado.ok).toBe(true);
    expect(avisos).toEqual([
      { id: 'transmissao', comando: { mensagem: 'Faltam 10 minutos', monitor: '\\\\.\\DISPLAY2' } },
      { id: 'fundo', comando: { mensagem: 'Faltam 10 minutos', monitor: null } },
    ]);
    expect(mensagens).toEqual([expect.objectContaining({ tipo: 'alerta', texto: 'Faltam 10 minutos' })]);
  });

  it('o monitor escolhido na hora do envio vale mais que o padrão da máquina', async () => {
    const { ctx, avisos } = montar();
    const { falhas } = await enviarAviso(ctx, {
      dispositivos: ['transmissao', 'fundo'],
      mensagem: 'Podem começar',
      noPainel: false,
      monitores: { transmissao: null, fundo: '\\\\.\\DISPLAY3' },
    });

    expect(falhas).toEqual([]);
    expect(avisos).toEqual([
      { id: 'transmissao', comando: { mensagem: 'Podem começar', monitor: null } },
      { id: 'fundo', comando: { mensagem: 'Podem começar', monitor: '\\\\.\\DISPLAY3' } },
    ]);
  });

  it('o aviso com tempo leva os segundos para a máquina; sem tempo, não leva nada', async () => {
    const { ctx, avisos } = montar();
    await enviarAviso(ctx, { dispositivos: ['fundo'], mensagem: 'Com tempo', noPainel: false, segundos: 15 });
    await enviarAviso(ctx, { dispositivos: ['fundo'], mensagem: 'Sem tempo', noPainel: false, segundos: null });

    expect(avisos.map((a) => a.comando.segundos)).toEqual([15, undefined]);
  });

  it('"todas as telas" manda um aviso para cada monitor que a máquina informou', async () => {
    const { ctx, avisos } = montar();
    ctx.store.atualizarDispositivos([
      {
        id: 'fundo',
        nome: 'FUNDO',
        host: '10.0.0.1',
        online: true,
        ultimoContato: null,
        ndi: [],
        agente: {
          online: true,
          erro: null,
          processos: {},
          emPrimeiroPlano: null,
          capacidades: [],
          monitores: [
            { id: '\\\\.\\DISPLAY1', principal: true, largura: 1920, altura: 1080 },
            { id: '\\\\.\\DISPLAY2', principal: false, largura: 1920, altura: 1080 },
          ],
        },
      },
    ]);
    await enviarAviso(ctx, { dispositivos: ['fundo'], mensagem: 'Oi', noPainel: false, monitores: { fundo: '*' } });

    expect(avisos.map((a) => a.comando.monitor).sort()).toEqual(['\\\\.\\DISPLAY1', '\\\\.\\DISPLAY2']);
  });

  it('uma máquina fora do ar não impede o aviso nas outras, mas o passo acusa a falha', async () => {
    const { ctx, avisos } = montar('fundo');
    const resultado = await executarCenario(ctx, {
      id: 'aviso',
      nome: 'Aviso',
      acoes: [{ tipo: 'aviso.mostrar', dispositivos: ['transmissao', 'fundo'], mensagem: 'Oi', noPainel: false, monitores: {}, segundos: null }],
    });

    expect(avisos.map((a) => a.id)).toEqual(['transmissao']);
    expect(resultado.ok).toBe(false);
    expect(resultado.acoes[0]?.erro).toContain('FUNDO');
  });

  it('manda o agente abrir o programa', async () => {
    const { ctx, apps } = montar();
    const resultado = await executarCenario(ctx, {
      id: 'pre',
      nome: 'Pré-culto',
      acoes: [{ tipo: 'app.acao', dispositivo: 'fundo', app: 'holyrics', acao: 'abrir' }],
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.acoes[0]?.descricao).toBe('FUNDO → abrir o Holyrics');
    expect(apps).toEqual([{ id: 'fundo', comando: { app: 'holyrics', acao: 'abrir' } }]);
  });
});
