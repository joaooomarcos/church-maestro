import { carregarConfig } from './config.js';
import { iniciarHeartbeat } from './heartbeat.js';
import { criarPontePowerPoint } from './ppt/index.js';
import { iniciarServidor } from './rotas.js';

async function main(): Promise<void> {
  const config = await carregarConfig();
  const ponte = criarPontePowerPoint();

  const servidor = await iniciarServidor(config, ponte);
  const heartbeat = iniciarHeartbeat(config, ponte);

  console.log(
    `[agente] escutando na porta ${config.porta} — dispositivoId=${config.dispositivoId} powerpoint=${ponte.disponivel ? 'disponível' : 'indisponível'}`,
  );

  let encerrando = false;
  const encerrar = (sinal: NodeJS.Signals) => {
    if (encerrando) return;
    encerrando = true;
    console.log(`[agente] recebido ${sinal}, encerrando...`);

    heartbeat.parar();
    void Promise.allSettled([servidor.close(), ponte.encerrar()]).then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', encerrar);
  process.on('SIGTERM', encerrar);
}

main().catch((err) => {
  console.error('[agente] falha ao iniciar:', err);
  process.exit(1);
});
