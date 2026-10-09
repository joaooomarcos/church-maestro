import { describe, it, expect, vi } from 'vitest';
import type { DispositivoConfig, EstadoHolyrics, Snapshot } from '@maestro/shared';
import { criarAtualizadorAoLigar } from './atualizarAoLigar.js';
import type { Drivers } from '../drivers/tipos.js';
import { dispositivosDemo } from '../drivers/mock.js';

function snapshotCom(holyrics: Record<string, EstadoHolyrics>): Snapshot {
  return {
    ts: Date.now(),
    revisao: 1,
    naoIdentificados: [],
    dispositivos: Object.entries(holyrics).map(([id, estado]) => ({
      id,
      nome: id,
      host: '',
      online: estado.online,
      ultimoContato: null,
      ndi: [],
      holyrics: estado,
    })),
  };
}

const ligado: EstadoHolyrics = { online: true, erro: null, apresentacao: null };
const desligado: EstadoHolyrics = { online: false, erro: 'sem resposta', apresentacao: null };
const exibindo: EstadoHolyrics = {
  online: true,
  erro: null,
  apresentacao: { id: '1', tipo: 'song', nome: 'Santo', slide: 1, totalSlides: 3, tipoSlide: 'default' },
};

function preparar(dispositivos: DispositivoConfig[] = dispositivosDemo()) {
  let atual = snapshotCom({ 'note-frente': desligado, 'pc-fundo': ligado });
  const atualizarFonte = vi.fn(async () => undefined);
  const avisar = vi.fn();
  const atualizador = criarAtualizadorAoLigar({
    dispositivos: () => dispositivos,
    drivers: { obs: { atualizarFonte } } as unknown as Drivers,
    snapshot: () => atual,
    esperaMs: 0,
    avisar,
  });
  return {
    atualizador,
    atualizarFonte,
    avisar,
    mudar: (s: Record<string, EstadoHolyrics>) => {
      atual = snapshotCom(s);
    },
  };
}

describe('atualizar as fontes de legenda quando o Holyrics liga', () => {
  it('atualiza as duas fontes daquele Holyrics ao passar de desligado para ligado', async () => {
    const { atualizador, atualizarFonte, avisar, mudar } = preparar();
    await atualizador.verificar();
    expect(atualizarFonte).not.toHaveBeenCalled();

    mudar({ 'note-frente': ligado, 'pc-fundo': ligado });
    await atualizador.verificar();

    expect(atualizarFonte.mock.calls.map((c) => (c as unknown[])[1])).toEqual(['holyrics1_musica', 'holyrics1_biblia']);
    expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/Note Frente/), 'info');
  });

  it('não mexe em nada na primeira leitura (o hub acabou de subir)', async () => {
    const { atualizador, atualizarFonte, mudar } = preparar();
    mudar({ 'note-frente': ligado, 'pc-fundo': ligado });
    await atualizador.verificar();
    expect(atualizarFonte).not.toHaveBeenCalled();
  });

  it('não atualiza se o Holyrics já ligou exibindo algo', async () => {
    const { atualizador, atualizarFonte, mudar } = preparar();
    await atualizador.verificar();
    mudar({ 'note-frente': exibindo, 'pc-fundo': ligado });
    await atualizador.verificar();
    expect(atualizarFonte).not.toHaveBeenCalled();
  });

  it('respeita o interruptor desligado em Ajustes › Legendas', async () => {
    const dispositivos = dispositivosDemo().map((d) =>
      d.servicos.obs?.legendas
        ? { ...d, servicos: { ...d.servicos, obs: { ...d.servicos.obs, legendas: { ...d.servicos.obs.legendas, atualizarAoLigar: false } } } }
        : d,
    );
    const { atualizador, atualizarFonte, mudar } = preparar(dispositivos);
    await atualizador.verificar();
    mudar({ 'note-frente': ligado, 'pc-fundo': ligado });
    await atualizador.verificar();
    expect(atualizarFonte).not.toHaveBeenCalled();
  });

  it('fica quieto quando o OBS ainda está fechado', async () => {
    const { atualizador, atualizarFonte, avisar, mudar } = preparar();
    atualizarFonte.mockRejectedValue(new Error('OBS fechado'));
    await atualizador.verificar();
    mudar({ 'note-frente': ligado, 'pc-fundo': ligado });
    await atualizador.verificar();
    expect(atualizarFonte).toHaveBeenCalledTimes(2);
    expect(avisar).not.toHaveBeenCalled();
  });
});
