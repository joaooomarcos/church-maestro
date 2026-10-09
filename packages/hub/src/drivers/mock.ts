import { ALTURA_AMOSTRA, LARGURA_AMOSTRA } from '@maestro/shared';
import type {
  CapturaMonitor,
  ComandoPpt,
  DispositivoConfig,
  EstadoAgente,
  EstadoHolyrics,
  EstadoNdiMonitor,
  EstadoObs,
  EstadoPowerPoint,
  ItemPlaylistHolyrics,
  StatusPpt,
} from '@maestro/shared';
import type { Drivers, GatilhoHolyrics } from './tipos.js';

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
  'PC-TRANSMISSAO (Screen Capture)',
  'NOTE-SOM (Screen Capture)',
];

const PLAYLIST_MOCK: ItemPlaylistHolyrics[] = [
  { id: 'mock-musica-1', titulo: 'Grandioso És Tu', artista: 'Hinário' },
  { id: 'mock-musica-2', titulo: 'Castelo Forte', artista: 'Hinário' },
  { id: 'mock-musica-3', titulo: 'Rocha Eterna' },
  { id: 'mock-musica-4', titulo: 'Em Espírito e em Verdade' },
];

interface ApresentacaoMock {
  id?: string;
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

const CENAS_OBS_MOCK = ['Câmera Frente', 'Câmera Fundo', 'Louvor NDI', 'Tela Cheia PPT', 'Cena_Elementos'];

/**
 * Montagem das legendas no OBS de demonstração, igual à da igreja: a cena
 * "Cena_Elementos" tem um grupo para a música e outro para a leitura, e cada
 * Holyrics tem uma fonte web dentro de cada grupo. O gatilho do Holyrics abre e
 * fecha o grupo inteiro.
 */
const LEGENDAS_MOCK = {
  cena: 'Cena_Elementos',
  grupoMusica: 'Legendas Música',
  grupoLeitura: 'Legendas Leitura',
  holyrics: [
    { dispositivo: 'note-frente', fonteMusica: 'holyrics1_musica', fonteLeitura: 'holyrics1_biblia' },
    { dispositivo: 'pc-fundo', fonteMusica: 'holyrics2_musica', fonteLeitura: 'holyrics2_biblia' },
  ],
};

/**
 * Fonte que "carregou antes do Holyrics abrir": fica vazia até alguém clicar
 * em Atualizar. Existe para quem desenvolve ver a falha e o botão de correção.
 */
const FONTES_VELHAS_MOCK = ['holyrics2_biblia'];

type PapelLegenda = 'musica' | 'leitura';

const TIPOS_MUSICA = new Set(['song', 'lyrics', 'letras']);

function papelDaApresentacao(tipo: string | undefined): PapelLegenda | null {
  if (!tipo) return null;
  if (TIPOS_MUSICA.has(tipo)) return 'musica';
  if (tipo === 'verse') return 'leitura';
  return null;
}

/** Os quatro gatilhos que a igreja usa, como GetTriggers devolveria. */
const GATILHOS_MOCK: GatilhoHolyrics[] = [
  { id: 'g1', ativo: true, quando: 'displaying', tipo: 'any_song', receptor: 'obs_v5', descricao: 'Abre legenda música' },
  { id: 'g2', ativo: true, quando: 'closing', tipo: 'any_song', receptor: 'obs_v5', descricao: 'Fecha legenda música' },
  { id: 'g3', ativo: true, quando: 'displaying', tipo: 'any_verse', receptor: 'obs_v5', descricao: 'Abre legenda bíblia' },
  { id: 'g4', ativo: true, quando: 'closing', tipo: 'any_verse', receptor: 'obs_v5', descricao: 'Fecha legenda bíblia' },
];

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
  // Olhinho dos grupos de legenda. A música começa aberta porque o Note Frente
  // começa com o louvor no ar.
  const grupoAberto: Record<PapelLegenda, boolean> = { musica: true, leitura: false };
  const fontesVelhas = new Set(FONTES_VELHAS_MOCK);

  function obterApresentacao(dispositivoId: string): ApresentacaoMock | null {
    if (!apresentacoesPorDispositivo.has(dispositivoId)) {
      // Só o Note Frente começa com algo no ar; o PC Fundo começa livre.
      apresentacoesPorDispositivo.set(dispositivoId, dispositivoId === 'pc-fundo' ? null : apresentacaoInicial());
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
        fontesPorJanela.set(chave, FONTE_INICIAL_JANELA_MOCK[chave] ?? (porta === 80 ? (FONTES_NDI_MOCK[0] ?? null) : null));
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
      // Gatilho "ao encerrar": fecha o grupo do tipo que estava no ar.
      const papel = papelDaApresentacao(obterApresentacao(dispositivo.id)?.tipo);
      if (papel) grupoAberto[papel] = false;
      apresentacoesPorDispositivo.set(dispositivo.id, null);
    },
    async listarPlaylist() {
      return PLAYLIST_MOCK;
    },
    async mostrarLetra(dispositivo, letraId) {
      const musica = PLAYLIST_MOCK.find((item) => item.id === letraId);
      if (!musica) return;
      apresentacoesPorDispositivo.set(dispositivo.id, {
        id: musica.id,
        nome: musica.titulo,
        tipo: 'lyrics',
        slide: 1,
        totalSlides: 4,
        tipoSlide: 'verse',
      });
      grupoAberto.musica = true; // gatilho "ao exibir música"
    },
    async mostrarVersiculo(dispositivo, referencia) {
      apresentacoesPorDispositivo.set(dispositivo.id, {
        nome: referencia,
        tipo: 'verse',
        slide: 1,
        totalSlides: 1,
        tipoSlide: 'default',
      });
      grupoAberto.leitura = true; // gatilho "ao exibir texto bíblico"
    },
    async listarGatilhos() {
      return GATILHOS_MOCK.map((g) => ({ ...g }));
    },
    async definirF() {
      // Mock: F8/F9/F10 não têm efeito observável no schema de estado — só precisa não falhar.
    },
    async paginaVisualizacao(dispositivo) {
      const nome = obterApresentacao(dispositivo.id)?.nome ?? 'Nada no ar';
      const pagina = `<body style="margin:0;display:grid;place-items:center;height:100vh;background:#000;color:#fff;font:600 7vw sans-serif;text-align:center">${nome}<br><small style="font:400 3vw sans-serif;opacity:.6">Holyrics (demonstração)</small></body>`;
      return `data:text/html;charset=utf-8,${encodeURIComponent(pagina)}`;
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
    async capturarSource(dispositivo, source) {
      // A captura muda quando o Holyrics dono da fonte exibe o tipo certo de
      // conteúdo — o sufixo faz o papel dos pixels que mudariam no OBS real.
      // A fonte "velha" fica vazia até ser atualizada.
      const legendas = dispositivo.servicos.obs?.legendas;
      const dono = legendas?.holyrics.find((h) => h.fonteMusica === source || h.fonteLeitura === source);
      if (!dono) {
        // Fonte do formato antigo: muda com qualquer coisa no ar.
        const temTextoNoAr = [...apresentacoesPorDispositivo.values()].some((a) => a !== null);
        return temTextoNoAr ? `${PNG_1X1_BASE64}#legenda` : PNG_1X1_BASE64;
      }
      if (fontesVelhas.has(source)) return PNG_1X1_BASE64;
      const papel: PapelLegenda = dono.fonteMusica === source ? 'musica' : 'leitura';
      const apresentacao = apresentacoesPorDispositivo.get(dono.dispositivo) ?? null;
      if (!apresentacao || papelDaApresentacao(apresentacao.tipo) !== papel) return PNG_1X1_BASE64;
      return `${PNG_1X1_BASE64}#${source}:${apresentacao.nome}:${apresentacao.slide}`;
    },
    async estrutura() {
      const fonte = (nome: string, tipo: string | null = 'browser_source') => ({ nome, tipo, grupo: false });
      const grupo = (nome: string) => ({ nome, tipo: null, grupo: true });
      return {
        cenas: CENAS_OBS_MOCK.map((nome) =>
          nome === LEGENDAS_MOCK.cena
            ? { nome, itens: [grupo(LEGENDAS_MOCK.grupoMusica), grupo(LEGENDAS_MOCK.grupoLeitura)] }
            : { nome, itens: [fonte('Câmera', 'dshow_input'), fonte(LEGENDAS_MOCK.cena, null)] },
        ),
        grupos: [
          { nome: LEGENDAS_MOCK.grupoMusica, itens: [fonte('holyrics1_musica'), fonte('holyrics2_musica')] },
          {
            nome: LEGENDAS_MOCK.grupoLeitura,
            itens: [fonte('Faixa verde', 'image_source'), fonte('holyrics1_biblia'), fonte('holyrics2_biblia')],
          },
        ],
      };
    },
    async itemVisivel(dispositivo, cena, item) {
      const papel = papelDoGrupo(dispositivo, item);
      if (!papel) throw new Error(`"${item}" não está dentro de "${cena}" (mock)`);
      return grupoAberto[papel];
    },
    async definirItemVisivel(dispositivo, cena, item, visivel) {
      const papel = papelDoGrupo(dispositivo, item);
      if (!papel) throw new Error(`"${item}" não está dentro de "${cena}" (mock)`);
      grupoAberto[papel] = visivel;
    },
    async urlDaFonte(_dispositivo, fonte) {
      const host = fonte.startsWith('holyrics1') ? '192.168.0.21' : fonte.startsWith('holyrics2') ? '192.168.0.22' : null;
      if (!host) return null;
      return `http://${host}:8080/${fonte.endsWith('_biblia') ? 'biblia' : 'legenda'}`;
    },
    async atualizarFonte(dispositivo, fonte) {
      fontesVelhas.delete(fonte);
      console.log(`[mock] fonte "${fonte}" atualizada no OBS do ${dispositivo.nome}`);
    },
    async encerrar() {
      // Nada a fechar: o mock não mantém conexão real.
    },
  };

  function papelDoGrupo(dispositivo: DispositivoConfig, item: string): PapelLegenda | null {
    const legendas = dispositivo.servicos.obs?.legendas ?? LEGENDAS_MOCK;
    if (item === legendas.grupoMusica) return 'musica';
    if (item === legendas.grupoLeitura) return 'leitura';
    return null;
  }

  const agente: Drivers['agente'] = {
    async ler(dispositivo) {
      return estadoAgenteMock(dispositivo, inicioProcesso);
    },
    async lerPowerPoint(dispositivo) {
      return estadoPowerPointMock(obterPpt(dispositivo.id));
    },
    async miniaturaPowerPoint(dispositivo, qual) {
      const ppt = obterPpt(dispositivo.id);
      if (!ppt.emApresentacao) throw new Error('A apresentação não está no modo exibição.');
      const slide = ppt.slide + (qual === 'proximo' ? 1 : 0);
      if (slide > ppt.totalSlides) throw new Error('Este é o último slide.');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#1f3a5f"/><text x="480" y="250" font-family="sans-serif" font-size="72" fill="#fff" text-anchor="middle">Slide ${slide}</text><text x="480" y="330" font-family="sans-serif" font-size="30" fill="#b8c7dc" text-anchor="middle">${ppt.arquivo ?? ''} (demonstração)</text></svg>`;
      return { imagem: Buffer.from(svg, 'utf8'), tipo: 'image/svg+xml', slide };
    },
    async comandarPowerPoint(dispositivo, comando) {
      const ppt = obterPpt(dispositivo.id);
      aplicarComandoPpt(ppt, comando);
      return statusPptDe(ppt);
    },
    async atualizar(dispositivo, sha) {
      console.log(`[mock] atualizaria ${dispositivo.nome} para ${sha}`);
    },
    async teclaApp(dispositivo, app, direcao) {
      console.log(`[mock] tecla ${direcao} para ${app ?? 'a janela da frente'} em ${dispositivo.nome}`);
    },
    async mostrarAviso(dispositivo, comando) {
      console.log(`[mock] aviso em ${dispositivo.nome} (${comando.monitor ?? 'monitor principal'}): ${comando.mensagem}`);
    },
    async capturarMonitor(dispositivo, monitor) {
      return capturaMock(dispositivo, monitor ?? null);
    },
    async acordar(dispositivo) {
      console.log(`[mock] acordar ${dispositivo.nome}`);
    },
    async fecharAvisos(dispositivo) {
      console.log(`[mock] fechar avisos em ${dispositivo.nome}`);
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
      id: apresentacao.id ?? 'mock-1',
      tipo: apresentacao.tipo,
      nome: apresentacao.nome,
      slide: apresentacao.slide,
      totalSlides: apresentacao.totalSlides,
      tipoSlide: apresentacao.tipoSlide,
    },
  };
}

const transmitindoNoMock = process.env.MAESTRO_MOCK_TRANSMITINDO === '1';

function estadoObsMock(cenaAtual: string, inicioProcesso: number): EstadoObs {
  const segundos = (Date.now() - inicioProcesso) / 1000;
  const bitrate = Math.round(4500 + 300 * Math.sin(segundos / 5) + (Math.random() * 100 - 50));
  const framesPerdidos = Math.floor(segundos / 90); // sobe bem devagar, só pra parecer vivo
  return {
    online: true,
    erro: null,
    cenaAtual,
    cenas: [...CENAS_OBS_MOCK],
    // Fora do ar por padrão, para dar para rodar o teste de legendas no mock;
    // MAESTRO_MOCK_TRANSMITINDO=1 volta ao OBS "ao vivo" (ver o bloqueio do teste).
    transmitindo: transmitindoNoMock,
    gravando: false,
    tempoTransmissaoS: transmitindoNoMock ? Math.floor(segundos) : 0,
    bitrateKbps: transmitindoNoMock ? Math.max(0, bitrate) : 0,
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
    // Nenhuma máquina de demonstração tem OBS instalado, a não ser a da transmissão.
    appsInstalados: ehLinux
      ? []
      : dispositivo.servicos.obs
        ? ['obs', 'holyrics', 'powerpoint', 'ndi-studio-monitor', 'ndi-screen-capture']
        : ['holyrics', 'powerpoint', 'ndi-studio-monitor', 'ndi-screen-capture'],
    ...(ehLinux
      ? {}
      : {
          monitores: [
            { id: '\\\\.\\DISPLAY1', principal: true, largura: 1920, altura: 1080 },
            { id: '\\\\.\\DISPLAY2', principal: false, largura: 1280, altura: 720 },
          ],
        }),
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

/** Fonte que cada janela do Studio Monitor exibe ao ligar o mock (host:porta), para o teste do NDI cobrir ✓, ✗ e ⚠. */
const FONTE_INICIAL_JANELA_MOCK: Record<string, string> = {
  '192.168.0.20:80': 'NOTE-FRENTE (Screen Capture)',
  '192.168.0.20:81': 'PC-FUNDO (Screen Capture)',
  '192.168.0.20:82': 'PC-FUNDO (Screen Capture)',
  '192.168.0.22:80': 'NOTE-FRENTE (Screen Capture)',
  '192.168.0.22:81': 'PC-LIVE (Screen Capture)',
};

interface CenaMock {
  /** Tom de cinza do fundo (0–255) e matiz (0–360) usado na miniatura. */
  fundo: number;
  matiz: number;
  /** Retângulos em coordenadas da amostra (64x36). */
  blocos: Array<{ x: number; y: number; l: number; a: number; tom: number }>;
}

const CENA_NOTE_FRENTE: CenaMock = {
  fundo: 40,
  matiz: 215,
  blocos: [
    { x: 4, y: 4, l: 30, a: 6, tom: 220 },
    { x: 4, y: 14, l: 44, a: 4, tom: 150 },
    { x: 4, y: 22, l: 36, a: 4, tom: 150 },
    { x: 46, y: 24, l: 14, a: 8, tom: 200 },
  ],
};

/** Outra imagem inteira: o telão do PC Fundo mostrando outra coisa. */
const CENA_ANTIGA: CenaMock = {
  fundo: 200,
  matiz: 28,
  blocos: [
    { x: 30, y: 3, l: 30, a: 12, tom: 60 },
    { x: 4, y: 20, l: 20, a: 12, tom: 90 },
    { x: 40, y: 22, l: 20, a: 10, tom: 20 },
  ],
};

const CENA_PRETA: CenaMock = { fundo: 0, matiz: 0, blocos: [] };

const CENA_PADRAO: CenaMock = {
  fundo: 90,
  matiz: 140,
  blocos: [
    { x: 8, y: 8, l: 48, a: 20, tom: 170 },
    { x: 14, y: 14, l: 12, a: 8, tom: 30 },
  ],
};

function cenaDoMonitorMock(dispositivoId: string, monitor: string): CenaMock {
  const chave = `${dispositivoId}|${monitor.toUpperCase()}`;
  const cenas: Record<string, CenaMock> = {
    'note-frente|\\\\.\\DISPLAY1': CENA_NOTE_FRENTE,
    'pc-transmissao|\\\\.\\DISPLAY2': CENA_NOTE_FRENTE,
    'pc-fundo|\\\\.\\DISPLAY2': CENA_ANTIGA,
    'pc-fundo|\\\\.\\DISPLAY1': CENA_PRETA,
  };
  return cenas[chave] ?? CENA_PADRAO;
}

/** Print sintético: um SVG pequeno e a amostra em cinza da mesma cena, para o mock exercitar a comparação de verdade. */
function capturaMock(dispositivo: DispositivoConfig, monitorPedido: string | null): CapturaMonitor {
  const monitor = monitorPedido ?? '\\\\.\\DISPLAY1';
  const cena = cenaDoMonitorMock(dispositivo.id, monitor);
  const amostra = new Uint8Array(LARGURA_AMOSTRA * ALTURA_AMOSTRA).fill(cena.fundo);
  for (const bloco of cena.blocos) {
    for (let y = bloco.y; y < Math.min(ALTURA_AMOSTRA, bloco.y + bloco.a); y++) {
      for (let x = bloco.x; x < Math.min(LARGURA_AMOSTRA, bloco.x + bloco.l); x++) {
        amostra[y * LARGURA_AMOSTRA + x] = bloco.tom;
      }
    }
  }
  const luz = (tom: number): number => Math.round((tom / 255) * 80 + 8);
  const retangulos = [{ x: 0, y: 0, l: LARGURA_AMOSTRA, a: ALTURA_AMOSTRA, tom: cena.fundo }, ...cena.blocos]
    .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.l}" height="${r.a}" fill="hsl(${cena.matiz},55%,${luz(r.tom)}%)"/>`)
    .join('');
  const numero = /DISPLAY(\d+)/i.exec(monitor)?.[1] ?? '1';
  const rotulo = `${dispositivo.nome} · tela ${numero}`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 36">${retangulos}` +
    `<text x="32" y="33" font-family="sans-serif" font-size="2.6" fill="#fff" text-anchor="middle">${rotulo} (demonstração)</text></svg>`;
  return {
    monitor,
    largura: 1920,
    altura: 1080,
    miniatura: Buffer.from(svg, 'utf8').toString('base64'),
    tipoMiniatura: 'image/svg+xml',
    amostra: Buffer.from(amostra).toString('base64'),
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
        obs: {
          porta: 4455,
          senha: 'demo',
          legendas: {
            ...LEGENDAS_MOCK,
            holyrics: LEGENDAS_MOCK.holyrics.map((h) => ({ ...h })),
            atualizarAoLigar: true,
            // Exemplo: o culto da noite de domingo. "Forçar teste" passa por cima.
            horariosProibidos: [{ dias: [0], inicio: '19:00', fim: '21:30' }],
            versiculo: 'Sl 23:1',
          },
        },
        // 80 mostra o Note Frente (parecido), 81 o PC Fundo (tela bloqueada: inconclusivo)
        // e a 82 ainda não tem monitor informado.
        ndiMonitor: { portas: [80, 81, 82], monitores: { '80': '\\\\.\\DISPLAY2', '81': '\\\\.\\DISPLAY2' } },
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
        holyrics: { porta: 8091, token: 'demo', legendaUrl: 'http://192.168.0.22:8080/legenda' },
        // 80 deveria mostrar o Note Frente mas está com outra imagem (diferente); 81 recebe uma
        // fonte que não é máquina do painel.
        ndiMonitor: { portas: [80, 81], monitores: { '80': '\\\\.\\DISPLAY2', '81': '\\\\.\\DISPLAY1' } },
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
