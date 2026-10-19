# Instalação do Maestro

Guia para montar o Maestro nas máquinas da igreja. Não é preciso saber
programar: é **um comando por máquina**, e um assistente pergunta o resto.

A ordem importa. Primeiro sobe o **hub** (o painel, no PC Transmissão); depois
cada máquina se apresenta a ele. O assistente acha o hub sozinho na rede, então
ninguém precisa anotar IP, porta nem token.

**Antes de começar**, instale o Node.js 20 ou superior em todas as máquinas —
veja a seção 0.

---

## 0. Instalar o Node.js

O Node é o programa que faz o Maestro rodar. Sem ele, os comandos das seções
seguintes não existem.

### Windows (PC Transmissão, Note Frente, PC Fundo)

1. No navegador da própria máquina, abra **nodejs.org**.
2. A página destaca um botão verde com um número de versão e a palavra **LTS** —
   é esse. Clique para baixar o instalador `.msi`.
3. Abra o arquivo baixado e clique **Next** em todas as telas, aceitando os
   padrões. Termine com **Install** e depois **Finish**.
4. Abra o **PowerShell** (tecla Windows, digite `powershell`, Enter) e digite:

   ```powershell
   node -v
   npm -v
   ```

   Se aparecer um número de versão em cada linha, deu certo. Se aparecer "não é
   reconhecido como um comando", feche e abra o PowerShell de novo; se ainda
   assim não reconhecer, reinicie a máquina.

   Se aparecer um erro dizendo que **a execução de scripts foi desabilitada
   neste sistema** (mencionando `npm.ps1`), rode:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

   Confirme com `S` e rode `npm -v` de novo. Isso libera scripts locais (como o
   do npm) sem abrir mão da proteção contra script baixado da internet.

> Sem internet na máquina? Baixe o `.msi` em outro computador (versão **LTS para
> Windows x64**) e leve por pendrive.

### Linux (Note Som)

O repositório padrão do Ubuntu/Debian costuma trazer um Node velho demais:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Confira com `node -v` e `npm -v`.

---

## 1. PC Transmissão: subir o hub

Faça **primeiro** nesta máquina — as outras precisam do hub no ar para se
configurarem.

No PowerShell:

```powershell
irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.ps1 | iex
```

O comando faz tudo sozinho e para em três perguntas:

1. **"Esta máquina é o PC Transmissão, a que roda o painel?"** → responda `s`.
   Ele sobe o hub como tarefa que abre junto com o Windows, **sem janela**, para
   ninguém fechar por engano.
2. **"Novo PIN"** → o PIN é a senha que a equipe digita para abrir o painel.
   Escolha **exatamente 4 dígitos** que a equipe vá lembrar. Não há tela no painel
   para trocá-lo depois: o PIN fica em `config/hub.json`.
3. Em seguida entra o **assistente desta máquina** (seção 2) — o PC Transmissão
   também tem um agente, e é aqui que você diz que ela roda o OBS.

**Teste.** Abra `http://localhost:8700` nessa máquina: tem que aparecer a tela
de PIN, com quatro bolinhas. Do celular, na mesma rede, abra `http://<ip-do-pc-transmissao>:8700`.
Para descobrir o IP, rode `ipconfig` e olhe o "Endereço IPv4".

---

## 2. Cada máquina: instalar e configurar

Nas outras três (Note Frente, PC Fundo, Note Som), com o hub já no ar:

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.ps1 | iex
```

Linux (Note Som):

```bash
curl -fsSL https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.sh | bash
```

Na pergunta "Esta máquina é o PC Transmissão?", responda `n`.

Depois de instalar, o **assistente** abre e conversa com você:

1. **Encontrar o hub.** Ele varre a rede e mostra o que achou; confirme com
   Enter. Se não achar, ele pede o IP do PC Transmissão.
2. **Nome desta máquina.** É o nome que a equipe vê no painel: "Note Frente",
   "PC Fundo", "Note Som".
3. **NDI, Holyrics e OBS.** Para cada um ele pergunta se esta máquina usa. Se
   sim, mostra na tela o passo a passo de como ativar e **testa na hora**,
   dizendo em português o que deu errado. Os detalhes estão na seção 3.
4. **PIN do hub.** O mesmo PIN de 4 dígitos que a equipe usa no painel. É ele que autoriza a
   máquina a entrar — sem PIN, qualquer aparelho do wi-fi poderia se cadastrar.

No fim, a máquina aparece sozinha no painel e o agente sobe junto com o Windows,
sem janela. Não há nada para editar à mão: o hub guarda o cadastro.

**Teste.** No painel, a máquina fica **verde** em até 10 segundos.

---

## 3. O que o assistente pergunta

O assistente já mostra estes passos na hora certa. Esta seção é para consultar
com calma, ou quando algo não passar no teste dele.

### NDI Studio Monitor (PC Fundo e PC Transmissão)

É o que permite ao Maestro trocar a imagem que cada datashow exibe.

1. Abra o **NDI Studio Monitor**.
2. Clique com o botão direito na janela (ou no ícone de engrenagem).
3. Marque **Allow Web Control**.
4. Se houver mais de uma janela aberta, repita em cada uma. A 1ª janela usa a
   porta **80**, a 2ª a **81**, a 3ª a **82**. O PC Fundo, que controla dois
   destinos, costuma ter duas.

O assistente descobre as portas sozinho depois que o Web Control está ligado.

Depois, em **Sistema › Ajustes › NDI**, informe o monitor de cada janela do
Studio Monitor e o monitor que o NDI Screen Capture envia. É com isso que o teste
do NDI compara as imagens (veja "O teste do NDI diz que não deu para comparar"
nos Problemas comuns).

> **Note Som (Linux):** o NDI Studio Monitor é um programa de Windows — não há o
> que configurar nessa máquina.

### Holyrics (Note Frente e PC Fundo)

1. Menu **Arquivo** › **Configurações** › **API Server**.
2. Ative o servidor e veja a porta (o padrão é **8091**).
3. Clique em **gerenciar permissões** e crie um token chamado `maestro`.
4. Na coluna **Local**, marque: `GetCurrentPresentation`, `ActionNext`,
   `ActionPrevious`, `ActionGoToIndex`, `CloseCurrentPresentation`, `SetF8`,
   `SetF9`, `SetF10`, `GetLyricsPlaylist`, `ShowLyrics` (em algumas versões
   aparece como `ShowSong`), `ShowVerse` e `GetTriggers`.
5. Copie o token e cole no assistente. Cada máquina tem o seu.

As quatro últimas são do teste de legendas: ele exibe a primeira música da lista
de reprodução (`ShowLyrics`) e um versículo (`ShowVerse`) e confere os gatilhos
(`GetTriggers`, que pede o Holyrics **2.24 ou mais novo**). Token antigo, sem
elas, faz o teste falhar dizendo qual permissão falta: é só marcar e rodar de novo.

O assistente também pergunta a **URL da legenda**: é o endereço que está na
fonte de navegador do OBS que mostra a letra. Ela serve para o visor do telão.

### OBS (PC Transmissão)

1. Menu **Ferramentas** › **Configurações do Servidor WebSocket**.
2. Marque **Ativar Servidor WebSocket** (porta padrão **4455**).
3. Se usar senha, tenha ela à mão para colar no assistente.

As fontes de legenda não são perguntadas pelo assistente: depois do pareamento,
abra o painel em **Sistema › Ajustes › Legendas** (veja a seção 3.8). Rodar o
assistente de novo no PC Transmissão não apaga o que foi escolhido lá.

### Firewall

O instalador libera sozinho as portas do próprio Maestro (8700 e 8770). As
portas dos outros programas precisam ser liberadas uma vez, no PowerShell **como
administrador**, na máquina que roda cada um:

```powershell
New-NetFirewallRule -DisplayName "Holyrics API - Maestro" -Direction Inbound -Protocol TCP -LocalPort 8091 -Action Allow
New-NetFirewallRule -DisplayName "OBS WebSocket - Maestro" -Direction Inbound -Protocol TCP -LocalPort 4455 -Action Allow
New-NetFirewallRule -DisplayName "NDI Studio Monitor - Maestro" -Direction Inbound -Protocol TCP -LocalPort 80,81 -Action Allow
```

---

## 3.5. Quem vai apresentar controla os próprios slides

No menu do painel, em **Compartilhar › Controle remoto**, escolha no campo
**Máquina a controlar** a máquina onde a apresentação está aberta e toque em
**Mostrar QR code**. Cada link (fixo ou temporário) tem a sua máquina, escolhida
no próprio formulário.

A pessoa aponta a câmera, digita o **PIN de convidado** que aparece ao lado do
QR (é diferente do PIN da equipe e não abre o painel) e ganha uma tela com dois
botões: avançar e voltar. Ela escolhe o que está controlando:

- **Holyrics** e **PowerPoint**: o Maestro fala direto com o programa.
- **Setas do teclado**: para qualquer outra coisa (PDF, Canva, navegador). O
  agente manda a seta para a janela que estiver na frente, então a pessoa não
  precisa escolher programa.

O QR temporário dura um dia. Para cortar antes disso, use **Trocar o link**: o
QR antigo para de funcionar na hora.

### A tela do celular não apaga durante o controle

Na página do convidado e nas telas **PowerPoint** e **Holyrics** do painel, o
Maestro segura a tela do celular acesa (Android e iPhone). Isso começa **no
primeiro toque na tela**: o navegador não deixa começar antes. Se a pessoa sair
para outro aplicativo e voltar, o primeiro toque religa.

O que pode atrapalhar, e o que fazer:

- **iPhone no Modo Pouca Energia** (bateria amarela) pode apagar a tela mesmo
  assim. Desligue o modo em Ajustes › Bateria durante o culto.
- **Android com economia de bateria** agressiva faz o mesmo: desligue a economia
  ou deixe o celular na tomada.
- Se nada disso resolver num aparelho específico, aumente o tempo de bloqueio
  automático dele (Ajustes › Tela) para o máximo durante o culto.

Quando o celular bloqueia ou troca de wi-fi mesmo assim, a página se recupera
sozinha ao voltar: busca o estado na hora e, se o hub não responder, mostra
**Sem conexão com o painel. Tentando de novo…** e insiste a cada 2 segundos, sem
pedir o PIN de novo. Um comando que não tem resposta em 6 segundos é abandonado
(o botão volta a ficar tocável) com o aviso para conferir o wi-fi. Se o aviso
de sem conexão não some, o celular saiu do wi-fi da igreja (foi para o 4G ou
para outra rede): reconecte.

### Links fixos (para quem apresenta sempre)

Na mesma tela, a lista de **links fixos** guarda vários links, cada um com nome,
máquina, modo e a opção de controle completo. Cada link tem o próprio **PIN de 4
dígitos** e **não expira**:

- O celular digita o PIN uma vez e fica conectado até o PIN mudar.
- **O PIN pode ser escolhido por você.** Ao criar o link, preencha o campo **PIN
  (4 dígitos)**; se deixar em branco, o Maestro sorteia um. O mesmo vale em
  **Trocar PIN**: o campo aparece ao tocar no botão, e em branco sorteia.
- **Trocar PIN** derruba só os celulares daquele link.
- Todos os PINs de convidado (o do link temporário e os dos links fixos) têm
  exatamente 4 dígitos, e o celular os digita no mesmo teclado numérico do PIN da
  equipe. Quem digita PIN errado 10 vezes em 5 minutos fica bloqueado por esse
  tempo.
- **PIN antigo:** ao iniciar, o hub troca sozinho qualquer PIN de convidado que não
  tenha 4 dígitos por um novo (e avisa no log). Nos links fixos isso também
  desconecta os celulares; passe o PIN novo, que aparece em **Controle remoto**.
- **Copiar link**, **Mostrar QR code** e **Excluir** ficam em cada item.
- Os dados ficam em `config/convidados.json`, fora do git. Esse arquivo tem os
  PINs: não o envie para ninguém.
- O link **sobrevive a reinício do hub e do agente e a atualizações** (o arquivo é
  preservado e o cookie dos celulares é assinado com o segredo de
  `config/hub.json`). O link usa o endereço do hub, então ele só continua abrindo
  nos celulares se o **IP do PC Transmissão for fixo** (na igreja já é). Numa
  instalação nova, reserve um IP fixo para esse PC no roteador.

### Controle completo

Por padrão, o convidado só tem avançar e voltar. A opção **Controle completo**
(desligada por padrão, marcada por link) libera mais:

- **Holyrics:** lista de reprodução e os botões F8, F9, F10 e Sair.
- **PowerPoint:** Iniciar e Encerrar, e a prévia do slide atual e do próximo.

Sair, Tela preta e Encerrar pedem confirmação, só para o convidado. O hub confere
as permissões no servidor.

Tudo isso só funciona na rede da igreja.

---

## 3.6. Compartilhar links e arquivos entre o celular e os PCs

Para passar uma URL enorme ou um arquivo do celular para um PC da igreja (ou o
contrário), sem WhatsApp Web nem pendrive:

- **No PC:** clique no atalho **Maestro - Compartilhar** na área de trabalho
  (o instalador cria).
- **No celular:** no menu do painel, em **Compartilhar › Links e arquivos**,
  toque em **Mostrar QR code** e escaneie.

Na página, cole um link ou texto e toque em **Enviar texto**, ou use **Enviar
arquivo** (até 100 MB). No outro aparelho, o conteúdo aparece sozinho em alguns
segundos, com os botões **Copiar**, **Abrir** (quando é link) ou **Baixar**.

Regras que valem a pena saber:

- Fica **um item só**: colar algo novo substitui o que estava lá.
- **Reiniciar o painel apaga tudo.**
- É **aberto para quem está na rede da igreja** — inclusive o wi-fi de
  visitantes, se for o mesmo. Não use para senhas ou documentos pessoais.
- Arquivos sempre **baixam**, nunca abrem direto no navegador. É de propósito:
  impede que um arquivo enviado por qualquer um rode dentro do painel.

---

## 3.7. Cenários e automações

Um **cenário** deixa várias coisas prontas de uma vez: trocar a fonte de um
datashow, trocar a cena do OBS, ligar o plano de fundo do Holyrics, fechar a
apresentação, mudar o relógio do Holyrics, abrir ou fechar um programa, mostrar
um aviso na tela, esperar um pouco entre um passo e outro. Eles ficam em
**Automação › Cenários**, no menu ☰, e aparecem como atalhos no alto do Painel.

- **Novo cenário:** dê um nome, escolha um ícone e adicione os passos. Máquina,
  janela e fonte são escolhidas em listas, com os nomes reais — não tem como
  errar a digitação.
- Se um passo falhar, os outros continuam, e o painel avisa qual falhou. A
  exceção é o "Abrir" com **Esperar abrir** (abaixo).
- **Esperar um pouco:** além dos atalhos (300 ms a 1 min), **Outro…** aceita
  qualquer tempo em segundos, até 5 minutos (ex.: `2,5`).
- **Abrir um programa** não abre uma segunda cópia se ele já estiver aberto —
  pode rodar o "Pré-culto" duas vezes sem medo. Programa pesado (o Holyrics)
  leva alguns segundos para abrir: se o passo seguinte depende dele, ligue
  **Esperar abrir antes do próximo passo**. O cenário só segue quando o
  programa está pronto — no Holyrics, quando a API responde (a janela aparece
  bem antes disso); nos outros, quando a janela aparece. Se não ficar pronto no
  tempo máximo (60 s, ajustável), **o resto do cenário não roda** e o painel diz
  por quê. Desligado, o passo só manda abrir e segue na hora.
- **Relógio do Holyrics:** mostra, esconde ou muda o canto do relógio que o
  Holyrics desenha sobre o papel de parede. O mesmo controle fica na tela
  **Holyrics**, em **Relógio do telão** (posição, tamanho, ligar/desligar). O
  token do API Server precisa ter permissão para `GetWallpaperSettings` e
  `SetWallpaperSettings`.

### Avisos na tela

O passo **Mostrar um aviso na tela** manda uma mensagem ("Faltam 10 minutos,
hora de iniciar a transmissão") para as máquinas escolhidas e, se marcado, para
o painel de quem estiver com o celular aberto.

- **Windows:** abre uma janela amarela por cima de tudo, com um som, que fica
  até alguém clicar em **Ok, visto**.
- **Linux (Note Som):** notificação do sistema. Se não aparecer, instale o
  `notify-send`: `sudo apt install libnotify-bin`.
- **Painel:** o aviso cobre a tela e o celular vibra; some ao tocar em **Ok,
  visto**.

Para mandar um aviso na hora, sem montar cenário ("câmera 2 sem imagem",
"podem começar"), use **Operação › Avisos** no menu: escreva, marque onde ele
aparece e toque em **Enviar aviso**. As mensagens usadas há pouco ficam
guardadas no celular para reenviar com um toque.

**Antes de usar, escolha o monitor** em **Sistema › Ajustes › Onde os avisos
aparecem**. As máquinas têm mais de uma tela, e um aviso no telão aparece para a
igreja; um aviso na tela que o NDI Screen Capture envia vai para a live. Para
cada máquina, escolha a tela de quem opera e toque em **Testar**: o aviso de
teste abre naquela tela, e dá para conferir na hora. "Tela 2" é o mesmo número
que o Windows mostra em Configurações › Sistema › Tela.

Em **Automação › Automações** um cenário roda sozinho: escolha o cenário, os
dias da semana e a hora (por exemplo, "Pré-culto, domingo, 18:50"). O interruptor
**Automações ligadas**, no alto, liga e desliga **todas** as automações de uma vez.

Além do horário, existe o gatilho **"Quando uma máquina ligar"**: ele roda um
cenário (por exemplo, abrir o Holyrics) depois de uma espera configurável, de 30
segundos por padrão. Ele dispara só quando a máquina passa de desligada para
ligada, depois de ficar pelo menos 60 segundos fora do ar. Se a máquina cair
durante a espera, a execução é cancelada.

Reiniciar o hub no meio do culto não reabre programas: a primeira leitura depois
que o hub inicia não dispara nada.

O agendamento usa o relógio do PC Transmissão, que precisa estar ligado e com
o painel no ar na hora marcada. Se ele ligar mais de 2 minutos depois, aquele
horário é pulado até a próxima semana — rodar o "Pré-culto" atrasado, no meio
do culto, faria mais mal do que bem. No alto do Painel, o cartão **Agendamentos**
mostra os próximos 2 horários (ou o aviso de que as automações estão desligadas).
O cartão **Última execução** mostra a execução mais recente, com os passos; uma
falha aparece em vermelho. Toda execução (manual, agendada ou ao ligar uma
máquina) entra no histórico, que fica só na memória do hub: reiniciar o hub o
apaga.

---

## 3.8. Legendas da transmissão

Cada Holyrics (Note Frente e PC Fundo) publica a letra e o texto bíblico em
páginas web, que o OBS mostra como **fontes de navegador**. No OBS, a cena
`Cena_Elementos` tem dois **grupos** (pastas com olhinho): um da **música**, com
uma fonte de cada Holyrics, e um da **leitura**, com uma fonte de cada Holyrics e
a faixa verde. Cada Holyrics tem quatro **gatilhos** que abrem e fecham o grupo
inteiro: ao exibir música, ao encerrar música, ao exibir texto bíblico, ao
encerrar texto bíblico. As fontes de cada Holyrics ficam sempre ligadas dentro
do grupo.

Em **Sistema › Ajustes › Legendas**, com o OBS aberto, toque em **Sugerir pelo
OBS**: o painel lê as cenas, grupos e fontes e preenche pelos nomes. Confira e
salve. Ali também ficam:

- **Atualizar as fontes automaticamente quando o Holyrics ligar** (ligado por
  padrão): quando um Holyrics liga sem nada no ar, o Maestro clica sozinho em
  "Atualizar" nas fontes dele no OBS. É o conserto do caso mais comum (abaixo).
- **Horários proibidos:** dias e horas em que o teste de legendas não roda —
  coloque os horários dos cultos.
- **Versículo do teste:** a referência exibida no teste da leitura.

**Testes › Testar legendas** testa um Holyrics por vez: confere os gatilhos,
exibe a primeira música da lista de reprodução e depois o versículo, e prova que
o grupo abriu e fechou sozinho e que a fonte daquele Holyrics mostrou o conteúdo.
Por segurança ele **não roda** com o OBS transmitindo ou gravando, em horário
proibido, ou com algo no ar em algum Holyrics. **Forçar teste** passa por cima
dos dois primeiros (ele avisa que a música e o versículo vão aparecer no telão e
podem ir para a transmissão), nunca do último. Máquina desligada não para o
teste: aquele Holyrics aparece em vermelho com o que ligar, e o outro é testado.

## 4. Ensaio antes do primeiro culto

Faça com calma, num dia que não seja domingo:

1. Ligue as quatro máquinas e abra o painel no celular.
2. Confira se as quatro aparecem **online**.
3. No menu **NDI**, troque a fonte do PC Fundo e confirme, olhando o datashow,
   que a imagem mudou. Depois, rode o teste do NDI (com os monitores já
   preenchidos em Sistema › Ajustes › NDI).
4. No menu **Holyrics**, exiba uma música e passe alguns slides pelo celular.
5. No menu **PowerPoint**, inicie a apresentação e passe slides.
6. Em **Sistema › Ajustes › Legendas**, toque em **Sugerir pelo OBS**, confira
   e salve. Depois, no menu **Testes**, rode **Testar legendas** com o OBS
   aberto e fora do ar — uma música e um versículo devem aparecer e sumir
   sozinhos em cada Holyrics.
7. Rode um **cenário** e confira se tudo foi para o estado esperado.
8. Em **Sistema › Ajustes**, escolha o monitor dos avisos de cada máquina e toque
   em **Testar** — o aviso não pode abrir no telão nem na tela transmitida.

Só depois de tudo isso passar vale usar o Maestro num culto — e ainda assim,
deixe os checklists impressos à mão nas primeiras semanas.

---

## 5. Atualizar o Maestro

Quem atualiza é o painel, em **Sistema › Versões** (no menu ☰). Nenhuma máquina se atualiza
sozinha: a decisão é sempre de quem está operando, na hora que escolher.

A tela mostra a versão instalada em cada máquina e a lista do que dá para
instalar, com a **(aprovada)** já selecionada. As versões têm número, do tipo
**0.2.1**: o do meio sobe quando entra uma funcionalidade nova (0.2.0 → 0.3.0),
o último quando é só uma correção (0.2.0 → 0.2.1). Número maior é mais novo.
Uma máquina que aparece com **sem número** está num commit que não foi liberado
como versão (instalada antes da 0.1.0, por exemplo) — é só atualizá-la.

1. Confira a versão escolhida no alto da tela.
2. No cartão da máquina, toque em **Atualizar de X para Y** (X é a versão
   instalada, Y a escolhida). Máquina que já está na versão escolhida mostra
   **✓ Atualizada** e não tem botão.
3. Acompanhe o andamento no próprio cartão: Baixando → Compilando → Trocando.

A máquina baixa e **compila numa pasta separada** antes de trocar qualquer
coisa. Se não compilar, nada é trocado e ela continua rodando como estava. Se o
painel ou o agente não voltarem depois da troca, ela **volta sozinha para a
versão anterior**. `config/` e `data/` nunca são tocados.

> **Do 0.1.0 para a 0.1.1:** o atualizador que roda é o que já está na máquina, e
> o da 0.1.0 apagava `config/agent.json` (o pareamento) e, no painel, o
> `hub.json` e o `devices.json`. Antes de atualizar uma máquina que está na
> 0.1.0, troque o script dela pelo corrigido (comando abaixo). Quem já passou
> pelo problema: restaure o `agent.json` da cópia de segurança ou rode
> `npm run setup`.

```powershell
cd ~\maestro; Invoke-WebRequest "https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/atualizar.ps1" -OutFile .\scripts\atualizar.ps1
```

Atualize **uma máquina de cada vez** e confira se ela volta verde antes da
próxima. A máquina marcada como **painel** é a que roda o hub: atualizar ela
tira o painel do ar por cerca de um minuto — espere e recarregue a página.

O que aconteceu fica registrado em cada máquina:

```powershell
Get-Content ~\maestro\data\atualizacao.log -Tail 20
```

A versão instalada também fica em `maestro/versao.txt`, e rodar o **comando de
instalação** de novo continua valendo quando algo estiver muito fora do lugar.

Feche antes os terminais abertos dentro da pasta `maestro` — no Windows, uma
pasta em uso não pode ser apagada, e o script avisa com **ERRO**.

---

## 6. Reconfigurar uma máquina

Trocou o Holyrics de máquina, mudou o nome, abriu outra janela do NDI? Rode na
máquina:

```powershell
cd ~\maestro
npm run setup
```

Ele mostra a configuração atual, refaz as perguntas e atualiza o cadastro no
hub. Renomear não cria uma máquina duplicada no painel.

> **Atenção:** renomear muda o id da máquina. Os mapeamentos de Ajustes › Legendas
> e os links fixos do convidado daquela máquina precisam ser refeitos.

Para o agente pegar a mudança:

```powershell
Start-ScheduledTask -TaskName maestro-agent
```

No Linux: `systemctl --user restart maestro-agent`.

---

## 7. Recomeçar do zero

Quando as máquinas ficaram muito para trás, ou algo ficou fora do lugar, dá
para tirar o Maestro de tudo e instalar de novo. Em **cada máquina**, no
PowerShell **como administrador**:

```powershell
irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/desinstalar.ps1 | iex
```

No Linux (Note Som):

```bash
curl -fsSL https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/desinstalar.sh | bash
```

Ele remove as tarefas agendadas, para o hub e o agente, apaga a pasta
`maestro`, o atalho da área de trabalho e as regras de firewall com "Maestro"
no nome. **Não** mexe no Node, no Holyrics, no OBS nem no NDI — o Web Control,
o API Server e os tokens continuam lá.

A pasta `config` antiga fica guardada em `maestro-config-antiga-<data>`, na
pasta do usuário. Serve só para consulta; pode apagar depois que tudo estiver
funcionando.

Depois, instale de novo a partir da **seção 1**, com o PC Transmissão primeiro.

---

## Problemas comuns

### A máquina não aparece no painel

- O agente não está rodando. Veja o log: `Get-Content ~\maestro\data\agent.log -Tail 20`
  (no Linux, `journalctl --user -u maestro-agent -n 30`).
- Se o log disser **"o hub não conhece esta máquina"**, ela não foi pareada:
  rode `npm run setup` nela.
- Se disser **"o token não confere"**, o hub foi reinstalado do zero depois do
  pareamento: rode `npm run setup` de novo.
- A porta 8770 pode estar bloqueada no firewall daquela máquina.

### O assistente não acha o hub

- O hub roda no PC Transmissão. Confira se ele está ligado e se o painel abre lá
  em `http://localhost:8700`.
- As máquinas precisam estar na **mesma rede** (nada de uma no wi-fi de
  visitantes).
- Se ainda assim não achar, digite o IP do PC Transmissão quando ele pedir.

### A atualização não terminou

- Veja o motivo no log da máquina:
  `Get-Content ~\maestro\data\atualizacao.log -Tail 20`. Ele diz se faltou
  internet ou se a compilação quebrou — nesses casos **nada foi trocado** e a
  máquina continua no ar na versão anterior.
- "revertido: a máquina voltou para a versão anterior" significa que a versão
  nova não subiu e a máquina se protegeu sozinha. Avise quem desenvolve.
- Se o cartão mostrar **✓ Atualizada**, a máquina já está na versão escolhida. Se
  o botão estiver desabilitado, a máquina está offline.
- O painel mostra "Instalando…" e há quanto tempo o pedido foi feito, mesmo com a
  máquina fora do ar durante a troca. Passando de 10 minutos sem a máquina voltar,
  o cartão avisa que falhou e o botão volta a funcionar para tentar de novo.
- **O cartão ficou preso em "Atualizando…" e não deixa tentar de novo** (até a
  0.5.0): o painel guardava o pedido para sempre quando a máquina não respondia.
  Corrigido na 0.6.0. Num painel ainda na 0.5.0, rode o atualizador na própria
  máquina travada — quando ela chegar na versão pedida, o cartão se solta
  sozinho, sem reiniciar o painel:
  `cd ~\maestro; powershell -ExecutionPolicy Bypass -File .\scripts\atualizar.ps1 -Forcar`
- **`config\agent.json` sumiu depois de atualizar** (o agente diz "ainda não foi
  configurada"): foi o atualizador da 0.1.0, que apagava a config. Está corrigido
  na 0.1.1; para quem passou por isso, restaure o arquivo de uma cópia ou rode
  `npm run setup`. Depois do setup, reinicie o agente de verdade (mate o `node`
  dele e suba a tarefa `maestro-agent`), senão ele segue com o token antigo e o
  painel diz que o agente "recusou o token".

### O ícone de ligar (Acordar)

No cartão de cada máquina, o ícone de ligar. Faz duas coisas juntas: pede para o
agente acordar a **tela** (monitor em repouso por inatividade) e manda o sinal de
**ligar pela rede** (Wake-on-LAN), para a máquina que está dormindo. O pedido é
sempre enviado, mesmo quando a máquina aparece online, porque uma máquina
dormindo pode aparecer online.

- A tela de bloqueio do Windows **não** é destravada: isso pede senha.
- O sinal pela rede só funciona se a máquina aceitar: na BIOS, ligar "Wake on
  LAN"; no Windows, Gerenciador de Dispositivos › placa de rede › Gerenciamento
  de energia › "Permitir que este dispositivo ative o computador". Funciona melhor
  no cabo do que no wi-fi.
- O endereço de rede (MAC) da máquina o Maestro aprende sozinho, quando ela está
  ligada com o agente no ar. Máquina nunca vista assim não pode ser acordada
  desligada.

### Manter ligado (a máquina não entra em repouso)

Na tela **Máquinas**, logo abaixo de Rede, o interruptor **Manter ligado**. Com
ele ligado, aquela máquina **não entra em repouso nem apaga a tela** por
inatividade, até alguém desligar o interruptor. Serve para o dia em que a máquina
precisa ficar no ar (um ensaio longo, um acesso remoto mais tarde).

- A escolha é **por máquina** e fica gravada nela: continua valendo depois de
  reiniciar o Windows e depois de atualizar o Maestro. Lembre de desligar quando
  não precisar mais, senão a máquina passa a semana acordada.
- Nada é alterado no plano de energia do Windows. Desligando o interruptor (ou
  com o agente parado), a máquina volta a seguir o tempo de repouso de sempre.
- **Não segura** o que é feito de propósito: fechar a tampa do notebook, apertar
  o botão de energia, mandar desligar ou suspender pelo menu Iniciar, ou acabar a
  bateria.
- A tela de bloqueio por senha continua valendo, se o Windows estiver
  configurado para bloquear sozinho.
- O interruptor só aparece em máquina **Windows**, com o agente no ar e na
  versão 0.8.0 ou mais nova. Se não aparece, atualize a máquina em **Sistema ›
  Versões**.

### RustDesk (acesso remoto)

O RustDesk entra na lista de programas como os outros: em **Máquinas** dá para
**Abrir** e **Fechar** (e trazer para frente ou reiniciar). O que o painel abre e
fecha é a **janela principal** do RustDesk.

- **Instalado como serviço do Windows** (o caso das máquinas da igreja): o acesso
  remoto fica sempre disponível, com a janela aberta ou não. A bolinha verde
  indica só se a janela principal está aberta. **Fechar não derruba quem está
  conectado** por ele: o serviço, a bandeja e a conexão em andamento não são
  tocados.
- **Versão portátil ou sem serviço:** ali a janela principal é o próprio
  RustDesk, então Fechar encerra o programa e a máquina deixa de aceitar conexão
  até alguém abrir de novo (pelo painel dá).
- **Ele não aparece na máquina?** Em máquina que já teve os programas escolhidos,
  ligue o RustDesk em **Sistema › Ajustes › Programas de cada máquina**.
- **"Não sei onde o RustDesk está instalado":** o Maestro procura em
  `C:\Program Files\RustDesk` e no atalho do Menu Iniciar. Na versão portátil
  (um `.exe` solto), rode `npm run setup` naquela máquina e informe o caminho.

### Programas que cada máquina usa

Em **Sistema › Ajustes › Programas de cada máquina** há um card por PC, com um
interruptor para cada programa. O que estiver desligado some do painel e da tela
**Máquinas** (Frente, Reiniciar, Fechar, Abrir) e não entra nos testes.
No painel, os quadros só aparecem para o que está **aberto**; quem está fechado
já aparece nas bolinhas.

### O visor do telão não aparece

As telas PowerPoint e Holyrics mostram o que está no telão.

- **PowerPoint:** a imagem é exportada pelo próprio PowerPoint, só durante a
  exibição. Mostra o slide como foi desenhado: animação no meio do slide não
  aparece. "Próximo" some no último slide.
- **Holyrics:** é a página `/view/widescreen` do próprio Holyrics, aberta direto
  do celular. O Maestro procura na porta da legenda e na do API Server; se não
  achar em nenhuma, o visor não aparece. O celular precisa estar na mesma rede
  da máquina do Holyrics.

### "Trazer para frente" não traz a janela

O Windows só deixa trazer uma janela para frente a quem acabou de receber um
toque do usuário; um processo solto, como o agente, só faz o ícone piscar na
barra de tarefas. O Maestro contorna isso, e confere se a janela de fato ficou na
frente: se não ficou, o painel avisa em vez de fingir que deu certo. Se o programa
estiver aberto **como administrador**, o Windows bloqueia de qualquer jeito: abra
o programa sem administrador, ou rode o Maestro também como administrador.

### Sistema › Versões não lista nada

- O hub precisa de internet para consultar as versões no GitHub. Sem ela, a aba
  mostra um aviso e as máquinas continuam rodando normalmente.

### O hub não sobe

- Veja `~\maestro\data\hub.log`.
- Se outra coisa já usa a porta 8700, o log mostra `EADDRINUSE`.

### As fontes NDI não aparecem na lista

- O **NDI Screen Capture** não está rodando na máquina que deveria enviar a
  imagem. Ele precisa estar aberto para a fonte existir na rede.
- As máquinas estão em redes diferentes.
- O Studio Monitor está sem **Allow Web Control**.

### O teste do NDI diz que não deu para comparar

O teste confere a fonte e depois compara, por imagem, o monitor da máquina que
envia com o monitor onde a janela do Studio Monitor aparece. Se ele responder
**⚠ inconclusivo**, veja o motivo:

- **Sessão do Windows bloqueada ou tela apagada:** a captura só funciona com a
  sessão desbloqueada. Desbloqueie a máquina e rode o teste de novo.
- **Monitor não informado:** em **Sistema › Ajustes › NDI**, preencha o monitor de
  cada janela do Studio Monitor e o monitor que o NDI Screen Capture envia.
- **Imagem lisa ou preta**, ou **origem fora do painel:** confira se a máquina de
  origem está no painel e com a imagem no ar. Os dois prints aparecem lado a
  lado: compare a olho nu.

### O Holyrics responde "invalid token"

- O token foi copiado com um espaço a mais ou faltando um pedaço.
- O token foi criado numa máquina e usado no cadastro de outra: cada Holyrics
  tem o seu.
- A ação usada não está marcada nas permissões do token. O painel diz qual ação
  faltou; volte em **gerenciar permissões** e marque.

### O PowerPoint não avança de slide

- **A causa mais comum:** o agente foi instalado como serviço do Windows em vez
  de tarefa "ao fazer logon". Como serviço ele não enxerga o PowerPoint. O
  instalador cria a tarefa do jeito certo — não troque por um serviço.
- O painel diz "nenhum arquivo foi carregado" com o arquivo aberto: é o
  agente de antes da versão 202c769, que ficava preso a um PowerPoint já
  fechado. Atualize a máquina em **Sistema › Versões**.
- A apresentação está aberta mas não foi iniciada. O painel avisa isso e oferece
  o botão **Iniciar apresentação**.
- O PowerPoint está com uma caixa de diálogo aberta esperando alguém clicar.
- O arquivo foi aberto pelo OneDrive em modo protegido: clique em **Habilitar
  Edição** antes de iniciar a apresentação.

### A legenda não aparece (fonte vazia no OBS)

O caso mais comum: o **Holyrics foi aberto depois do OBS**. A fonte de navegador
carregou a página quando o Holyrics ainda não estava no ar e não tenta de novo
sozinha — o gatilho abre o grupo, mas a fonte está vazia.

- **Conserto:** no OBS, botão direito na fonte web daquele Holyrics ›
  **Atualizar**. O teste de legendas aponta qual é a fonte e mostra o botão
  **Atualizar fonte**, que faz o mesmo pelo celular e testa de novo.
- **Prevenção:** deixe ligado "Atualizar as fontes automaticamente quando o
  Holyrics ligar" em Ajustes › Legendas, ou abra o Holyrics antes do OBS.
- Se atualizar não resolver, o teste diz se a fonte aponta para outro endereço
  que não o do Holyrics (o IP da máquina mudou): corrija a URL nas propriedades
  da fonte.

### O teste de legendas diz que o grupo não abriu ou não fechou

O conteúdo chegou, mas o gatilho do Holyrics não mexeu no grupo no OBS. Confira,
no Holyrics daquela máquina, o gatilho apontado ("ao exibir música", "ao
encerrar texto bíblico"…): ele precisa abrir ou fechar exatamente o grupo
configurado em Ajustes › Legendas. Se o grupo ficou aberto, o teste já o fechou.

### O teste de legendas não rodou ("Teste não executado")

É a trava de segurança: o OBS estava transmitindo ou gravando, era um horário
proibido, ou algum Holyrics tinha algo no ar. O motivo aparece no resultado.
Encerre a apresentação no Holyrics ou, fora do culto, use **Forçar teste**.

### O teste de legendas diz que a fonte muda sozinha

É um aviso, não um erro: significa que a fonte de legenda no OBS tem animação ou
vídeo por trás, e por isso o teste não consegue provar pela imagem que a legenda
chegou. Confira a olho nu na tela do OBS.

### Link fixo do convidado deixou de funcionar

- **O PIN foi trocado:** os celulares daquele link precisam digitar o PIN novo.
  Passe o PIN atual para quem apresenta.
- **O link foi excluído:** crie um novo em **Controle remoto** e mande o QR
  ou o link atualizado.
- **A máquina foi renomeada:** o id dela mudou, e o link precisa ser recriado.
