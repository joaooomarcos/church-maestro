import { uptime } from 'node:os';
import { CAMINHOS_CONTROLE_AGENTE } from '@maestro/shared';
import { criarArmazemEmArquivo, criarServicoAoLigar } from './aoLigar/index.js';
import { criarDependenciasReais } from './aoLigar/dependencias.js';
import { ConfigAusente, carregarConfig, carregarConfigSeExistir, salvarConfig } from './config.js';
import { criarMemoria } from './controle/memoria.js';
import { criarAtalhoControle } from './controle/atalho.js';
import { encerrarManterLigado, retomarManterLigado } from './energia.js';
import { iniciarHeartbeat } from './heartbeat.js';
import { criarPontePowerPoint } from './ppt/index.js';
import { definirConsultaLinhasDeComando } from './processos.js';
import { iniciarServidor } from './rotas.js';

async function main(): Promise<void> {
  const config = await carregarConfig();
  const ponte = criarPontePowerPoint();
  if (ponte.disponivel) definirConsultaLinhasDeComando((executavel) => ponte.linhasDeComando(executavel));

  retomarManterLigado(config.manterLigado);

  const memoria = criarMemoria(config);
  const aoLigar = criarServicoAoLigar({
    rotina: config.rotinaAoLigar,
    deps: criarDependenciasReais(config, memoria),
    armazem: criarArmazemEmArquivo(),
    gravarRotina: async (rotina) => {
      // Relê o arquivo: o "Manter ligado" e a memória do hub também gravam nele.
      const atual = await carregarConfigSeExistir();
      if (atual) await salvarConfig({ ...atual, rotinaAoLigar: rotina });
    },
    uptimeS: uptime,
    urlControle: `http://localhost:${config.porta}${CAMINHOS_CONTROLE_AGENTE.pagina}`,
  });

  const servidor = await iniciarServidor(config, ponte, { memoria, aoLigar });
  await aoLigar.iniciar();
  const heartbeat = iniciarHeartbeat(config, ponte);
  void criarAtalhoControle(config.porta);

  console.log(
    `[agente] escutando na porta ${config.porta} — dispositivoId=${config.dispositivoId} powerpoint=${ponte.disponivel ? 'disponível' : 'indisponível'}`,
  );

  let encerrando = false;
  const encerrar = (sinal: NodeJS.Signals) => {
    if (encerrando) return;
    encerrando = true;
    console.log(`[agente] recebido ${sinal}, encerrando...`);

    heartbeat.parar();
    aoLigar.parar();
    encerrarManterLigado();
    void Promise.allSettled([servidor.close(), ponte.encerrar()]).then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((err: unknown) => {
  if (err instanceof ConfigAusente) {
    console.error(`[agente] ${err.message}`);
    process.exit(1);
  }
  console.error('[agente] falha ao iniciar:', err);
  process.exit(1);
});
