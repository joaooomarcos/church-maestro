# Maestro — IPB Jacareí

Painel de operação dos cultos. Quatro máquinas (PC Transmissão, Note Frente, PC Fundo
— Windows — e Note Som — Linux), ligadas só em dia de culto. O hub roda no PC
Transmissão; cada máquina tem um agente local. Painel React pensado primeiro para celular.
Detalhes de produto: `README.md`; instalação, operação e problemas conhecidos: `docs/instalacao.md`;
roteiro de funções: `docs/plano-proximas-funcoes.md`.

Convenções detalhadas de código (nomes, como adicionar rota/driver/schema, testes): skill `convencoes-maestro`.

## Comandos (raiz, Node >= 20)

- `npm install` e `npm run build` — compila shared, hub, agent e web, nessa ordem.
- `npm run dev` — hub com máquinas simuladas (`MAESTRO_MOCK=1`), painel em http://localhost:8700, PIN inicial `1234`.
- `npm run dev:web` — Vite com recarga (outro terminal); `npm run dev:agent` — agente com `tsx watch`.
- `npm test` — vitest em todos os packages que têm teste (hub, agent). Um arquivo: `npx vitest run packages/hub/src/drivers/ndi.test.ts`.
- `npm run typecheck` — `tsc -b packages/shared packages/hub packages/agent`. **Não cobre o web**: use `npm run typecheck -w @maestro/web`.
- `npm run start` / `start:agent` / `setup` — rodam o `dist/` compilado (hub, agente, assistente de configuração).
- `npm run versao -- funcionalidade` — só troca o número (x.y.0) e faz o commit "Versão x.y.z", sem liberar.
- `npm run publicar -- funcionalidade|correcao|x.y.z|--desligar` — libera versão no `canal.json` (só a partir do `main`; `--notas "texto"` troca a descrição).
- `npm run atualizar` (atualiza esta máquina), `npm run checklists` (converte checklists de `manuais/`).

## Arquitetura

- `packages/shared` — contratos: schemas zod e tipos usados pelos três lados, `ROTAS` (`hub.ts`), constantes. Tudo exportado por `src/index.ts`.
- `packages/hub` — Fastify + WebSocket. `drivers/` (ndi, holyrics, obs, agente, mock), `rotas/` (uma função `registrarRotasX(app, ctx)` por assunto), `checks/` (testes de legenda e NDI), `cenarios/`, `automacoes/` (agendador), `estado/` (poller, store), `rede/`, `config.ts` (lê/grava `config/*.json`).
- `packages/agent` — Fastify local de cada máquina: status/heartbeat, PowerPoint (`ppt/` + `.ps1`), apps, avisos, captura, tela de controle (`controle/`), rotina "ao ligar" (`aoLigar/`), atualização (`versao.ts`).
- `packages/web` — React 18 + Vite. `telas/`, `componentes/`, `contexto/AppContext.tsx`, `nucleo/cliente.ts` (cliente HTTP), `estilos/`.

Como se conversam: web -> hub (HTTP + WebSocket, sessão por PIN); hub -> agente (HTTP com token, via `drivers/agente.ts`); hub -> NDI/Holyrics/OBS por drivers; agente -> hub por heartbeat e registro (descobre o hub na rede). O agente também atende o celular direto (controle solo) com o hub desligado.

**shared, hub e agent importam `@maestro/shared` pelo `dist/`** (project references, `composite`). Depois de mexer em `packages/shared/src`, rode `npm run build -w @maestro/shared` (ou deixe `npm run dev -w @maestro/shared` em watch) antes de `typecheck`/`test` de hub e agent. O web também importa `@maestro/shared`.

## Convenções

- UI, mensagens de erro, commits, docs e nomes de domínio em **português** (identificadores sem acento: `registrarRotasNdi`, `aoLigar`). Erros de driver (`ErroDriver`) já levam mensagem em português que sobe até a tela.
- Schemas zod e tipos de contrato vivem em `packages/shared`; hub, agent e web nunca redeclaram o mesmo formato. Validar corpo com `schema.safeParse` e responder via `rotas/erros.ts`.
- Imports relativos com extensão `.js` (NodeNext). TypeScript estrito com `noUncheckedIndexedAccess`.
- Versionamento `x.y.z`: funcionalidade nova sobe o do meio (0.10.0 -> 0.11.0), correção sobe o último (0.10.0 -> 0.10.1). Hoje: 0.10.0. Só documentação não gera versão.
- Publicação: ao voltar para o `main`, o GitHub Actions (`publicar.yml`) compila e testa num Windows e libera a versão. Trabalhe em branch; funcionalidade pede `npm run versao -- funcionalidade` antes de devolver.

## Regras

- **Todo aprendizado ou problema resolvido vai para `docs/`** (seção "Problemas comuns" de `docs/instalacao.md`, ou o guia do assunto), no mesmo trabalho que corrigiu.
- **Máquinas só se atualizam por canal aprovado**: elas seguem `canal.json`, não o `main`. Nunca faça as máquinas seguirem `main` nem atualizem sozinhas; quem aplica é o operador em Sistema > Versões.
- **O agente roda em Windows** (PowerShell `.ps1`, NDI, PowerPoint COM) enquanto o desenvolvimento é em **macOS**: no Mac use o modo mock e não assuma que o agente real roda aqui; cuidado com caminhos, quebras de linha e comandos específicos de Windows.
- Não edite à mão `package-lock.json` (use `npm install`), `dist/`, `data/` nem `config/{hub,agent,devices,automacoes,convidados}.json` (config local de cada instalação, com tokens e PIN; estão no `.gitignore`).
- Não comite sem pedido. Nunca coloque PIN, token ou segredo em código, doc ou commit.
