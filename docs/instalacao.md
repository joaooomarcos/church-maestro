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
   Escolha um número de 4 dígitos ou mais que a equipe vá lembrar.
3. Em seguida entra o **assistente desta máquina** (seção 2) — o PC Transmissão
   também tem um agente, e é aqui que você diz que ela roda o OBS.

**Teste.** Abra `http://localhost:8700` nessa máquina: tem que aparecer a tela
de PIN. Do celular, na mesma rede, abra `http://<ip-do-pc-transmissao>:8700`.
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
4. **PIN do hub.** O mesmo PIN que a equipe usa no painel. É ele que autoriza a
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

> **Note Som (Linux):** o NDI Studio Monitor é um programa de Windows — não há o
> que configurar nessa máquina.

### Holyrics (Note Frente e PC Fundo)

1. Menu **Arquivo** › **Configurações** › **API Server**.
2. Ative o servidor e veja a porta (o padrão é **8091**).
3. Clique em **gerenciar permissões** e crie um token chamado `maestro`.
4. Na coluna **Local**, marque: `GetCurrentPresentation`, `ActionNext`,
   `ActionPrevious`, `ActionGoToIndex`, `CloseCurrentPresentation`,
   `ShowQuickPresentation`, `SetF8`, `SetF9`, `SetF10`.
5. Copie o token e cole no assistente. Cada máquina tem o seu.

No Note Frente, o assistente também pergunta a **URL da legenda**: é o mesmo
endereço que está na fonte de navegador do OBS que mostra a letra.

### OBS (PC Transmissão)

1. Menu **Ferramentas** › **Configurações do Servidor WebSocket**.
2. Marque **Ativar Servidor WebSocket** (porta padrão **4455**).
3. Se usar senha, tenha ela à mão para colar no assistente.
4. O assistente pergunta o **nome exato da fonte de legenda** — o nome como
   aparece na lista de Fontes do OBS, com maiúsculas e acentos.

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

No menu do painel, em **Compartilhar › Slides do convidado**, escolha a
máquina onde a apresentação está aberta e toque em **Mostrar QR code**.

A pessoa aponta a câmera, digita o **PIN de convidado** que aparece ao lado do
QR (é diferente do PIN da equipe e não abre o painel) e ganha uma tela com dois
botões: avançar e voltar. Ela escolhe o que está controlando:

- **Holyrics** e **PowerPoint**: o Maestro fala direto com o programa.
- **Setas do teclado**: para qualquer outra coisa (PDF, Canva, navegador). A
  pessoa escolhe o programa e o agente o traz para frente antes de mandar a
  tecla.

O acesso dura um dia. Para cortar antes disso, use **Trocar o link**: o QR
antigo para de funcionar na hora.

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

## 3.7. Cenários e agendamentos

Um **cenário** deixa várias coisas prontas de uma vez: trocar a fonte de um
datashow, trocar a cena do OBS, ligar o plano de fundo do Holyrics, fechar a
apresentação, abrir ou fechar um programa, mostrar um aviso na tela, esperar um
pouco entre um passo e outro. Eles ficam em
**Automação › Cenários**, no menu ☰, e aparecem como atalhos no alto do Painel.

- **Novo cenário:** dê um nome, escolha um ícone e adicione os passos. Máquina,
  janela e fonte são escolhidas em listas, com os nomes reais — não tem como
  errar a digitação.
- Se um passo falhar, os outros continuam, e o painel avisa qual falhou.
- **Abrir um programa** não abre uma segunda cópia se ele já estiver aberto —
  pode rodar o "Pré-culto" duas vezes sem medo. Programa pesado (o Holyrics)
  leva alguns segundos para abrir: se o passo seguinte depende dele, ponha um
  "Esperar" no meio.

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

Em **Automação › Agendamentos** um cenário roda sozinho: escolha o cenário, os
dias da semana e a hora (por exemplo, "Pré-culto, domingo, 18:50"). O botão no
alto liga e desliga **todas** as automações de uma vez.

O agendamento usa o relógio do PC Transmissão, que precisa estar ligado e com
o painel no ar na hora marcada. Se ele ligar mais de 2 minutos depois, aquele
horário é pulado até a próxima semana — rodar o "Pré-culto" atrasado, no meio
do culto, faria mais mal do que bem. As últimas execuções aparecem no fim da
tela, com o que deu certo e o que falhou.

---

## 4. Ensaio antes do primeiro culto

Faça com calma, num dia que não seja domingo:

1. Ligue as quatro máquinas e abra o painel no celular.
2. Confira se as quatro aparecem **online**.
3. No menu **NDI**, troque a fonte do PC Fundo e confirme, olhando o datashow,
   que a imagem mudou.
4. No menu **Holyrics**, exiba uma música e passe alguns slides pelo celular.
5. No menu **PowerPoint**, inicie a apresentação e passe slides.
6. No menu **Testes**, rode **Testar legendas** com o OBS aberto — o texto de
   teste deve aparecer e sumir sozinho.
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
2. No cartão da máquina, toque em **Atualizar esta máquina**.
3. Acompanhe o andamento no próprio cartão: Baixando → Compilando → Trocando.

A máquina baixa e **compila numa pasta separada** antes de trocar qualquer
coisa. Se não compilar, nada é trocado e ela continua rodando como estava. Se o
painel ou o agente não voltarem depois da troca, ela **volta sozinha para a
versão anterior**. `config/` e `data/` nunca são tocados.

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
- Se o botão estiver apagado, a máquina está offline ou já está naquela versão.

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

### O teste de legendas diz que a fonte muda sozinha

É um aviso, não um erro: significa que a fonte de legenda no OBS tem animação ou
vídeo por trás, e por isso o teste não consegue provar pela imagem que a legenda
chegou. Confira a olho nu na tela do OBS.
