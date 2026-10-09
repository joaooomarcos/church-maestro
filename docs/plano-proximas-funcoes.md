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

## Fase 4 — Ícones SVG e acabamento ✔ feita

- Conjunto próprio de ícones SVG inline (sem dependência nova), um componente
  `Icone` com os nomes usados nas abas e nos cartões.
- Passe de acabamento: espaçamento, hierarquia de títulos e estados de botão.
- Os ícones dos cenários continuam vindo do `scenarios.json`: os emoji mais
  usados viram ícone de traço, e o que não estiver mapeado aparece como a
  equipe escreveu.

Com isso as quatro fases combinadas em 2026-09-21 estão entregues.

## Como retomar

`git log` conta o que já foi feito; cada fase acima entra como um commit próprio.
O estado atual de cada máquina da igreja aparece em **Sistema › Versões**, no menu do painel —
depois de mexer aqui, publique com `npm run publicar` e atualize as máquinas por
lá.

## Área de compartilhar (2026-09-27) ✔ feita

Página `/compartilhar`, aberta a quem está na rede: um item só (texto ou
arquivo de até 100 MB), colar de novo substitui e reiniciar o hub apaga. QR na
menu **Compartilhar › Links e arquivos** e atalho "Maestro - Compartilhar" criado pelo instalador.

Falta testar no Windows: o atalho na área de trabalho (inclusive com a área de
trabalho redirecionada pelo OneDrive) e o botão Copiar num navegador aberto
pelo IP da rede.

## Avisos na tela e programas nos cenários (2026-09-28) ✔ feita

Dois passos novos no editor de cenários:

- **Abrir ou fechar um programa** (abrir, fechar, reiniciar, trazer para
  frente). "Abrir" não abre uma segunda cópia se o programa já estiver aberto.
- **Mostrar um aviso na tela**: janela por cima de tudo no Windows, notificação
  no Linux e aviso no painel com vibração. Fica até alguém clicar em "Ok".

Também dá para mandar um aviso na hora, pelo menu **Operação › Avisos**, que
lembra os destinos e as últimas mensagens no próprio celular.

O monitor do aviso é escolhido por máquina em **Sistema › Ajustes**, com um
botão **Testar** (o agente informa os monitores no heartbeat). Rodar o
assistente de novo preserva essa escolha e o link do convidado.

Falta testar no Windows: se a janela aparece mesmo com o agente rodando
escondido (o `ShowWindow` extra no `Shown` existe por isso), se abre no monitor
certo com escala de tela diferente de 100%, e o `notify-send` no Note Som
rodando como serviço do usuário.

## Versão 0.6.0 (2026-10-09) ✔ feita

- **PIN da equipe:** exatamente 4 dígitos; a tela de PIN tem 4 bolinhas e entra
  sozinha ao digitar o 4º. Não há tela para trocar o PIN (fica em `config/hub.json`).
- **Painel:** cards de PC tocáveis abrem a tela **Máquinas** (seletor de PC, bloco
  Rede, lista de programas com Frente / Reiniciar / Fechar / Abrir). "Acordar"
  virou o ícone de ligar. Cards **Agendamentos** e **Última execução** no topo.
  Tiles de PowerPoint, Holyrics e NDI abrem a tela respectiva; OBS não é tocável.
- **Padrão visual:** seletor de PC no canto direito do cabeçalho; informação com
  borda fina, tocável com fundo preenchido; verde = no ar.
- **Holyrics e PowerPoint:** faixa de título com contador e barra de progresso;
  artista como texto leve; música no ar com borda verde; rodapé com Próximo e Anterior.
- **Automações** (antes "Agendamentos"): gatilho "Quando uma máquina ligar" roda um
  cenário depois de uma espera configurável (padrão 30 s).
- **Ajustes › Programas de cada máquina:** interruptor por programa.
- **Avisos:** tela em seções, "Enviar aviso" fixo no rodapé, resumo "Vai aparecer
  em…"; o aviso preso ficou no fim, recolhido.
- **Versões:** "✓ Atualizada" quando a máquina já está na versão escolhida;
  "Atualizar de → para" nos demais casos.
- **Controle remoto** (antes "Slides do convidado"; a máquina de cada link é escolhida num campo do formulário, não no cabeçalho): modo "Setas do teclado" manda a seta para a janela da
  frente; opção **Controle completo** por link; **links fixos** com PIN próprio de
  4 dígitos, sem expirar. Todos os PINs de convidado têm 4 dígitos; PIN antigo é
  trocado automaticamente na inicialização do hub (e as sessões do link fixo caem).
- **Teste do NDI:** compara por imagem a origem (NDI Screen Capture) com o destino
  (Studio Monitor). Configuração em Ajustes › NDI; limites em
  `packages/hub/src/checks/imagem.ts` (LIMITES_IMAGEM).
- **Menu:** o item "Dispositivos" saiu; as configurações ficam em Ajustes.

### A validar na igreja

- ShowSong/ShowLyrics e ShowVerse pela API do Holyrics disparam os gatilhos "ao
  exibir" como no uso manual, e CloseCurrentPresentation dispara os "ao encerrar".
  Conferir os nomes de gatilho (`any_song`, `any_song_slide`, `any_verse`, `closing`)
  e o nome exato da permissão (ShowLyrics ou ShowSong).
- GetSourceScreenshot de fonte de navegador dentro de grupo fechado mostra a
  página; GetSceneItemEnabled e GetGroupSceneItemList funcionam na versão do OBS
  da igreja.
- Esperas padrão: 1,8 s de renderização; até 3 s para o grupo abrir ou fechar;
  teste todo em ~15 s; 4 s antes da atualização automática ao ligar o Holyrics.
- Captura de tela do agente (`captura.ps1`): respeita o DPI; com a sessão bloqueada
  sai preta; timeout de 20 s ainda não medido. Limites de comparação do NDI a calibrar.
- Máquina "dormindo" pode aparecer online: o painel a considera online se o agente
  deu sinal nos últimos 30 s OU se alguma integração responde. Possível melhoria:
  avisar "Agente sem resposta" quando as integrações respondem mas o agente parou.
- Renomear uma máquina no assistente muda o id: os mapeamentos de Ajustes › Legendas
  e os links fixos do convidado precisam ser refeitos.

### Ideias para depois

- Persistir o histórico de execuções e o "visto há" em disco.
- Rota para trocar o PIN da equipe pelo painel.
- "Desligar" máquina pelo painel.
- Limpar o CSS antigo não usado em `packages/web/src/estilos.css`.
