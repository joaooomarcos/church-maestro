---
name: convencoes-maestro
description: Convenções de código do monorepo Maestro (shared, hub, agent, web) — nomes, estrutura de pastas, schemas zod, drivers, rotas Fastify, mensagens em português e testes vitest. Use ao criar ou alterar código nesses packages.
user-invocable: false
---

# Convenções de código do Maestro

Referência para escrever código novo que pareça com o existente. Tudo abaixo vem do código atual.

## Base

- ESM (`"type": "module"`), TypeScript estrito (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`), target ES2022, `module: NodeNext`. Imports relativos **com `.js`** (`import { x } from './contexto.js'`), `import type` para tipos.
- Pacotes `@maestro/shared|hub|agent|web`. hub e agent têm `references` para `../shared`; shared é consumido pelo `dist/`. Após mudar shared: `npm run build -w @maestro/shared`.
- Texto de UI, erros, comentários, nomes de domínio e testes em português. Identificadores sem acento, camelCase (`registrarRotasNdi`, `criarContexto`), constantes em MAIÚSCULAS (`ROTAS`, `APLICATIVOS`, `ESPERA_AO_LIGAR_PADRAO_S`). Schemas terminam em `Schema` (`definirFonteNdiSchema`); o tipo vem de `z.infer`.
- Comentários explicam o porquê e o contexto de operação (igreja, rede local, máquina desligada), em prosa curta, em português.

## packages/shared (contratos)

- Um arquivo por assunto em `src/` (`ndi.ts`, `cenarios.ts`, `aoLigar.ts`, ...), reexportado em `src/index.ts` com `export * from './x.js'`. Novo arquivo = nova linha no index.
- Padrão: `export const xSchema = z.object({...})` + `export type X = z.infer<typeof xSchema>`. Uniões por `z.discriminatedUnion('tipo', [...])` (ver `passoAoLigarSchema`). Listas fixas como `as const` + `z.enum(LISTA)` (`APLICATIVOS`, `ACOES_APP`).
- Limites e padrões explícitos no schema (`.int().min().max()`, `.trim().min(1)`, `.default(...)`), com mensagem em português quando o usuário a vê (`.refine(..., 'Use um endereço que comece com http://...')`). Constantes de domínio ficam junto, exportadas e comentadas.
- Rotas do hub ficam no objeto `ROTAS` (`src/hub.ts`) — nunca escreva a string da URL em hub nem em web. Formato de erro: `ErroApi` `{ erro, mensagem, detalhe? }`.
- Interfaces puras (sem validação) são aceitas quando o dado só sai do hub (`MaquinaNdiConfig`); o que **entra** por HTTP sempre tem schema.

## packages/hub

- `src/index.ts` monta tudo; `rotas/index.ts` registra cada assunto; `rotas/contexto.ts` define `ContextoApp` (config, drivers, store, acesso e gravação de dispositivos/cenários/automações). Rotas não leem arquivo nem falam com a rede direto: usam `ctx`.
- **Nova rota**: crie `rotas/assunto.ts` com `export function registrarRotasAssunto(app: FastifyInstance, ctx: ContextoApp): void`; adicione o caminho em `ROTAS` e o schema do corpo em shared; registre em `rotas/index.ts`. Modelo (`rotas/ndi.ts`): `schema.safeParse(req.body)` -> `responderRequisicaoInvalida`; `ctx.obterDispositivo(id)` -> `responderDispositivoNaoEncontrado`; chamada ao driver em `try/catch` -> `responderErroDriver` (502, mensagem em português). Sucesso: `reply.send({ ok: true })` ou o dado. Respostas de erro vêm sempre de `rotas/erros.ts`.
- **Drivers** (`drivers/`): interfaces em `tipos.ts` (`DriverNdi`, `DriverHolyrics`, `DriverObs`, `DriverAgente`, agrupadas em `Drivers`). Cada driver tem fábrica `criarDriverX()` e é montado em `drivers/index.ts` (`criarDrivers(mock, token)`). Métodos recebem `DispositivoConfig` e `op?: OpcoesRequisicao` (timeout curto, LAN). Falhas viram `ErroDriver(mensagemPtBr, causaTecnica?)`.
- **Novo método de driver**: assinatura em `tipos.ts` com comentário do que faz; implementação real; **implementação em `drivers/mock.ts`** com estado interno que reage (não eco fixo), para o painel funcionar no `npm run dev`; ajuste os fakes dos testes que montam `Drivers`.
- Config persistida em `config/*.json` via `config.ts` (carregar/salvar validando com schema de shared); gravação passa pelo `ctx`.
- Checks (legenda, NDI) em `checks/` com `tipos.ts` próprio; cenários em `cenarios/executar.ts`; agendamentos em `automacoes/agendador.ts`.

## packages/agent

- Fastify local; `rotas.ts` registra endpoints, valida token (`tokenValido`, `timingSafeEqual`) e corpos com schemas de shared. Funcionalidade grande vira pasta própria com `index.ts` (+ `rotas.ts` se tiver endpoints, ex.: `aoLigar/`).
- Código específico de Windows fica em `.ps1` ao lado do `.ts` (`ppt/ponte.ps1`, `apps/acoes.ps1`, `captura/captura.ps1`); o build copia ativos (`scripts/copiar-ativos.mjs`). Erros próprios (`ErroApp`, `ErroPowerPoint`) carregam mensagem em português.
- Mudou o contrato com o hub? Atualize shared, `drivers/agente.ts` do hub e o mock.

## packages/web

- React 18 + Vite, tsconfig próprio (`bundler`, `jsx: react-jsx`, DOM). Componentes e telas em PascalCase `.tsx`; `telas/` (uma por rota do menu), `componentes/` (reutilizáveis), `contexto/AppContext.tsx` (estado global/WebSocket), `nucleo/` (utilitários: `cliente.ts`, `copiar.ts`, `vibrar.ts`...), CSS em `estilos/*.css`.
- Chamadas HTTP só pelo cliente de `nucleo/cliente.ts` usando `ROTAS` de shared; falhas viram `ErroRequisicao` com mensagem pronta para mostrar. Sessão expirada (401) reabre a tela de PIN.
- Mobile primeiro. Textos em português, ícones SVG (`componentes/Icone.tsx`), sem emojis na UI.
- Verificação do web: `npm run typecheck -w @maestro/web` (não está no `typecheck` da raiz).

## Testes (vitest)

- Arquivo `x.test.ts` ao lado de `x.ts`; `import { describe, it, expect, vi } from 'vitest'`. Descrições (`describe`/`it`) em português descrevendo o comportamento. Hub: `vitest run`; agent: `vitest run --passWithNoTests`; web e shared não têm testes.
- Rotas: monte um `Fastify()` real (+ cookie/rate-limit se preciso), `criarContexto({...})` com `Store` e drivers falsos feitos com `vi.fn(async () => {})` e `app.inject(...)`; veja `rotas/convidado.test.ts`. Config em arquivos temporários (`mkdtemp(tmpdir())`), nunca em `config/` real.
- Drivers HTTP: servidor `node:http` local no teste (`drivers/ndi.test.ts`). Parsers de formatos não documentados (NDI, Holyrics) devem tolerar variações e ter teste para cada forma e para entrada inválida (devolve vazio, não quebra).
- Máquinas/dispositivos de teste: helper local `maquina(id, extra)` devolvendo `DispositivoConfig` completo.
- Bug corrigido ganha teste que o reproduz antes da correção, e a lição entra em `docs/` (seção "Problemas comuns").

## Antes de dar por pronto

`npm run build` -> `npm run typecheck` -> `npm run typecheck -w @maestro/web` -> `npm test`. Mudança visível ao operador: atualize `docs/instalacao.md` (e o README se mudar comando ou fluxo).
