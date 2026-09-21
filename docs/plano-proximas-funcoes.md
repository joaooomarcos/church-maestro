# Plano — próximas funções do Maestro

Combinado em 2026-09-21. As decisões já estão fechadas; cada fase pode ser feita
numa sessão separada, na ordem abaixo.

## Decisões tomadas

- **Abrir/controlar aplicativos vem primeiro** (é a base do simulador de teclas).
- **Ações nos apps:** abrir, trazer para frente, fechar e reiniciar.
- **Caminho dos programas:** o agente detecta sozinho nos lugares padrão; o que
  não achar, o assistente (`npm run setup`) pergunta uma vez e guarda.
- **QR do convidado:** protegido por um **PIN de convidado único para todas as
  máquinas**, configurável e visível no painel. Pedido no primeiro acesso e
  lembrado por ~24h no aparelho de quem escaneou.
- **Simulador de teclas:** o convidado escolhe o programa, o agente traz para a
  frente e só então manda a tecla.
- **Heartbeat:** um valor único para todas as máquinas, ajustável no painel e
  perguntado no assistente.
- **Visual:** trocar emojis por ícones SVG e dar um passe de acabamento
  (espaçamento, hierarquia, estados de botão) — sem redesenhar as telas.

## Fase 1 — Aplicativos: abrir, fechar, trazer para frente, primeiro plano ✔ feita

Já existe hoje: o agente reporta quais dos cinco apps estão abertos
(`packages/agent/src/processos.ts`) e o painel mostra isso em cada cartão.

1. `shared`: catálogo de apps com nomes de processo (já existe em
   `PROCESSOS_POR_APLICATIVO`) + schema de ação (`abrir | fechar | reiniciar |
   frente`) e `emPrimeiroPlano` no estado do agente.
2. `agent`:
   - achar o executável: caminhos padrão do Windows + atalhos do Menu Iniciar;
     o que faltar vai para `config/agent.json` (`caminhosApps`).
   - ponte PowerShell para janela em primeiro plano (`GetForegroundWindow`),
     trazer para frente, fechar (`CloseMainWindow`) e abrir (`Start-Process`).
   - rotas `GET /apps` e `POST /apps/acao`; `emPrimeiroPlano` no heartbeat.
3. `hub`: driver + rota `POST /api/apps/acao`; o estado já flui pelo `/health`.
4. `web`: mostrar "Em primeiro plano: X" no cartão e botões por aplicativo.
5. `setup`: perguntar o caminho dos apps que não foram detectados.

Falta testar no Windows de verdade: a detecção dos caminhos (principalmente as
pastas do NDI Tools, que mudam de nome a cada versão) e o "trazer para frente".

## Fase 2 — Heartbeat ajustável ✔ feita

- `intervaloHeartbeatMs` no `config/hub.json`; a resposta do heartbeat devolve o
  valor e o agente adota na hora (sem mexer em arquivo na máquina).
- Campo no painel e pergunta no assistente.

## Fase 3 — Controle por QR code (convidado) ✔ feita

- `hub`: `pinConvidado` no `config/hub.json`; token por máquina; rotas fora da
  sessão do operador: entrar com PIN, ler estado, mandar ação. Sessão do
  convidado dura ~24h e vale só para aquela máquina.
- `agent`: rota de teclas (`setas`) que traz o app escolhido para frente e envia
  a tecla (`SendKeys` no Windows).
- `web`: tela do QR no painel (mostra o PIN e permite trocá-lo) e a página do
  convidado: escolher Holyrics / PowerPoint / setas e dois botões grandes
  (avançar e voltar).
- A URL do QR usa o IP do hub na rede da igreja.

Falta testar no Windows: o envio das setas (`SendKeys`) depois de trazer o
programa para frente. O resto do fluxo foi testado ponta a ponta.

## Fase 4 — Ícones SVG e acabamento

- Conjunto próprio de ícones SVG inline (sem dependência nova), um componente
  `Icone` com os nomes usados nas abas e nos cartões.
- Passe de acabamento: espaçamento, hierarquia de títulos e estados de botão.

## Como retomar

`git log` conta o que já foi feito; cada fase acima entra como um commit próprio.
O estado atual de cada máquina da igreja aparece na aba **Versões** do painel —
depois de mexer aqui, publique com `npm run publicar` e atualize as máquinas por
lá.
