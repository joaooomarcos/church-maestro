import type {
  ComandoPpt,
  DispositivoConfig,
  EstadoAgente,
  EstadoHolyrics,
  EstadoNdiMonitor,
  EstadoObs,
  EstadoPowerPoint,
  StatusPpt,
} from '@maestro/shared';
import type { Drivers } from './tipos.js';

/**
 * Drivers falsos, com algum comportamento dinâmico, para desenvolver a UI no Mac sem
 * depender da rede da igreja. Comandos (próximo slide, trocar cena, ...) alteram um
 * estado interno de verdade — não é só eco fixo — para a tela reagir como reagiria
 * com o hardware real.
 */

const FONTES_NDI_MOCK = [
  'PC-LIVE (Screen Capture)',
  'NOTE-FRENTE (Screen Capture)',
  'PC-FUNDO (Screen Capture)',
];

interface ApresentacaoMock {
  nome: string;
  tipo: string;
  slide: number;
  totalSlides: number;
  tipoSlide: string;
}

function apresentacaoInicial(): ApresentacaoMock {
  return { nome: 'Culto de Domingo — Louvor', tipo: 'letras', slide: 1, totalSlides: 6, tipoSlide: 'letra' };
}

interface PptMock {
  emApresentacao: boolean;
  slide: number;
  totalSlides: number;
  arquivo: string;
}

function pptInicial(): PptMock {
  return { emApresentacao: true, slide: 1, totalSlides: 24, arquivo: 'Culto-2026-09-06.pptx' };
}

const CENAS_OBS_MOCK = ['Câmera Frente', 'Câmera Fundo', 'Louvor NDI', 'Tela Cheia PPT'];

/** PNG transparente 1x1 — só para o teste de "captura antes/depois" ter algo para comparar. */
const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

export function criarDriversMock(): Drivers {
  // Chave é host+porta: duas máquinas têm janela na porta 80, e tratá-las como
  // a mesma faria a interface mentir sobre qual datashow exibe o quê.
  const fontesPorJanela = new Map<string, string | null>();
  const chaveJanela = (host: string, porta: number): string => `${host}:${porta}`;
  const apresentacoesPorDispositivo = new Map<string, ApresentacaoMock | null>();
  const pptPorDispositivo = new Map<string, PptMock>();
  const cenaPorDispositivo = new Map<string, string>();
  const inicioProcesso = Date.now();

  function obterApresentacao(dispositivoId: string): ApresentacaoMock | null {
    if (!apresentacoesPorDispositivo.has(dispositivoId)) {
      apresentacoesPorDispositivo.set(dispositivoId, apresentacaoInicial());
    }
    return apresentacoesPorDispositivo.get(dispositivoId) ?? null;
  }

  function obterPpt(dispositivoId: string): PptMock {
    let ppt = pptPorDispositivo.get(dispositivoId);
    if (!ppt) {
      ppt = pptInicial();
      pptPorDispositivo.set(dispositivoId, ppt);
    }
    return ppt;
  }

  function obterCena(dispositivoId: string): string {
    return cenaPorDispositivo.get(dispositivoId) ?? (CENAS_OBS_MOCK[0] as string);
  }

  const ndi: Drivers['ndi'] = {
    async listarFontes() {
      return [...FONTES_NDI_MOCK];
    },
    async ler(host, porta) {
      const chave = chaveJanela(host, porta);
      if (!fontesPorJanela.has(chave)) {
        fontesPorJanela.set(chave, porta === 80 ? (FONTES_NDI_MOCK[0] ?? null) : null);
      }
      return {
        online: true,
        erro: null,
        porta,
        fonteAtual: fontesPorJanela.get(chave) ?? null,
        fontesDisponiveis: [...FONTES_NDI_MOCK],
      };
    },
    async definirFonte(host, porta, fonte) {
      fontesPorJanela.set(chaveJanela(host, porta), fonte);
    },
  };

  const holyrics: Drivers['holyrics'] = {
    async ler(dispositivo) {
      return estadoHolyricsMock(obterApresentacao(dispositivo.id));
    },
    async proximo(dispositivo) {
      const atual = obterApresentacao(dispositivo.id);
      if (atual) atual.slide = clamp(atual.slide + 1, 1, atual.totalSlides);
    },
    async anterior(dispositivo) {
      const atual = obterApresentacao(dispositivo.id);
      if (atual) atual.slide = clamp(atual.slide - 1, 1, atual.totalSlides);
    },
    async irPara(dispositivo, indice) {
      const atual = obterApresentacao(dispositivo.id);
      if (atual) atual.slide = clamp(indice, 1, atual.totalSlides);
    },
    async encerrarApresentacao(dispositivo) {
      apresentacoesPorDispositivo.set(dispositivo.id, null);
    },
    async definirF() {
      // Mock: F8/F9/F10 não têm efeito observável no schema de estado — só precisa não falhar.
    },
    async apresentacaoRapida(dispositivo, texto) {
      apresentacoesPorDispositivo.set(dispositivo.id, {
        nome: texto,
        tipo: 'mensagem',
        slide: 1,
        totalSlides: 1,
        tipoSlide: 'mensagem',
      });
    },
    async checarPaginaLegenda(dispositivo) {
      const url = dispositivo.servicos.holyrics?.legendaUrl ?? 'http://mock-holyrics/legendas';
      return { status: 200, url };
    },
  };

  const obs: Drivers['obs'] = {
    async ler(dispositivo) {
      return estadoObsMock(obterCena(dispositivo.id), inicioProcesso);
    },
    async definirCena(dispositivo, cena) {
      if (!CENAS_OBS_MOCK.includes(cena)) {
        throw new Error(`cena "${cena}" não existe no OBS (mock)`);
      }
      cenaPorDispositivo.set(dispositivo.id, cena);
    },
    async sourceVisivel() {
      return true;
    },
    async capturarSource() {
      // A captura precisa mudar quando existe texto no ar, senão o teste de
      // legendas reprova sempre no mock e quem desenvolve nunca vê o caminho
      // de sucesso. O sufixo faz o papel dos pixels que mudariam no OBS real.
      const temTextoNoAr = [...apresentacoesPorDispositivo.values()].some((a) => a !== null);
      return temTextoNoAr ? `${PNG_1X1_BASE64}#legenda` : PNG_1X1_BASE64;
    },
    async encerrar() {
      // Nada a fechar: o mock não mantém conexão real.
    },
  };

  const agente: Drivers['agente'] = {
    async ler(dispositivo) {
      return estadoAgenteMock(dispositivo, inicioProcesso);
    },
    async lerPowerPoint(dispositivo) {
      return estadoPowerPointMock(obterPpt(dispositivo.id));
    },
    async comandarPowerPoint(dispositivo, comando) {
      const ppt = obterPpt(dispositivo.id);
      aplicarComandoPpt(ppt, comando);
      return statusPptDe(ppt);
    },
    async atualizar(dispositivo, sha) {
      console.log(`[mock] atualizaria ${dispositivo.nome} para ${sha}`);
    },
    async acaoApp(dispositivo, comando) {
      console.log(`[mock] ${comando.acao} ${comando.app} em ${dispositivo.nome}`);
    },
  };

  return { ndi, holyrics, obs, agente };
}

function estadoHolyricsMock(apresentacao: ApresentacaoMock | null): EstadoHolyrics {
  if (!apresentacao) {
    return { online: true, erro: null, apresentacao: null };
  }
  return {
    online: true,
    erro: null,
    apresentacao: {
      id: 'mock-1',
      tipo: apresentacao.tipo,
      nome: apresentacao.nome,
      slide: apresentacao.slide,
      totalSlides: apresentacao.totalSlides,
      tipoSlide: apresentacao.tipoSlide,
    },
  };
}

function estadoObsMock(cenaAtual: string, inicioProcesso: number): EstadoObs {
  const segundos = (Date.now() - inicioProcesso) / 1000;
  const bitrate = Math.round(4500 + 300 * Math.sin(segundos / 5) + (Math.random() * 100 - 50));
  const framesPerdidos = Math.floor(segundos / 90); // sobe bem devagar, só pra parecer vivo
  return {
    online: true,
    erro: null,
    cenaAtual,
    cenas: [...CENAS_OBS_MOCK],
    transmitindo: true,
    gravando: false,
    tempoTransmissaoS: Math.floor(segundos),
    bitrateKbps: Math.max(0, bitrate),
    framesPerdidos,
    percFramesPerdidos: Number((framesPerdidos > 0 ? 0.02 : 0).toFixed(2)),
  };
}

function estadoAgenteMock(dispositivo: DispositivoConfig, inicioProcesso: number): EstadoAgente {
  const uptimeS = Math.floor((Date.now() - inicioProcesso) / 1000) + 3600;
  // O Note Som roda Linux e não tem PowerPoint; o mock precisa refletir isso,
  // senão a interface é desenvolvida contra um mundo que não existe.
  const ehLinux = dispositivo.id === 'note-som';
  return {
    online: true,
    erro: null,
    versao: '1.0.0-mock',
    versaoSha: ehLinux ? '0000000aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' : 'ffffffdddddddddddddddddddddddddddddddddd',
    versaoNotas: ehLinux ? 'versão antiga (mock)' : 'versão atual (mock)',
    so: ehLinux ? 'linux' : 'windows',
    uptimeS,
    processos: {
      obs: Boolean(dispositivo.servicos.obs),
      holyrics: Boolean(dispositivo.servicos.holyrics),
      powerpoint: !ehLinux,
      'ndi-studio-monitor': Boolean(dispositivo.servicos.ndiMonitor),
      'ndi-screen-capture': true,
    },
    emPrimeiroPlano: ehLinux
      ? null
      : { processo: 'holyrics', titulo: 'Holyrics — Culto de Domingo', app: 'holyrics' },
    capacidades: ehLinux ? ['abrir-app', 'desligar'] : ['powerpoint', 'abrir-app', 'desligar'],
  };
}

function estadoPowerPointMock(ppt: PptMock): EstadoPowerPoint {
  return {
    online: true,
    erro: null,
    emApresentacao: ppt.emApresentacao,
    slide: ppt.emApresentacao ? ppt.slide : null,
    totalSlides: ppt.emApresentacao ? ppt.totalSlides : null,
    arquivo: ppt.arquivo,
  };
}

function aplicarComandoPpt(ppt: PptMock, comando: ComandoPpt): void {
  switch (comando.acao) {
    case 'proximo':
      ppt.slide = clamp(ppt.slide + 1, 1, ppt.totalSlides);
      return;
    case 'anterior':
      ppt.slide = clamp(ppt.slide - 1, 1, ppt.totalSlides);
      return;
    case 'irPara':
      ppt.slide = clamp(comando.slide, 1, ppt.totalSlides);
      return;
    case 'iniciar':
      ppt.emApresentacao = true;
      return;
    case 'encerrar':
      ppt.emApresentacao = false;
      return;
  }
}

function statusPptDe(ppt: PptMock): StatusPpt {
  return {
    emApresentacao: ppt.emApresentacao,
    slide: ppt.emApresentacao ? ppt.slide : null,
    totalSlides: ppt.emApresentacao ? ppt.totalSlides : null,
    arquivo: ppt.arquivo,
  };
}

/**
 * Dispositivos de demonstração, usados só em modo mock. Espelham a montagem real
 * da igreja para a interface ser desenvolvida com a mesma forma de dados que vai
 * encontrar no domingo — inclusive o Note Som, que não tem projeção nenhuma.
 */
export function dispositivosDemo(): DispositivoConfig[] {
  return [
    {
      id: 'pc-transmissao',
      nome: 'PC Transmissão',
      host: '192.168.0.20',
      fixarHost: true,
      servicos: {
        agente: { porta: 8770, token: 'demo' },
        obs: { porta: 4455, senha: 'demo', sourceLegenda: 'Legenda' },
        ndiMonitor: { portas: [80] },
      },
    },
    {
      id: 'note-frente',
      nome: 'Note Frente',
      host: '192.168.0.21',
      fixarHost: true,
      servicos: {
        agente: { porta: 8770, token: 'demo' },
        holyrics: {
          porta: 8091,
          token: 'demo',
          legendaUrl: 'http://192.168.0.21:8080/legenda',
        },
      },
    },
    {
      id: 'pc-fundo',
      nome: 'PC Fundo',
      host: '192.168.0.22',
      fixarHost: true,
      servicos: {
        agente: { porta: 8770, token: 'demo' },
        holyrics: { porta: 8091, token: 'demo' },
        ndiMonitor: { portas: [80, 81] },
      },
    },
    {
      id: 'note-som',
      nome: 'Note Som',
      host: '192.168.0.23',
      fixarHost: true,
      servicos: { agente: { porta: 8770, token: 'demo' } },
    },
  ];
}
