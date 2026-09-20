# Instalação do Maestro

Guia para quem vai montar o Maestro nas máquinas da igreja pela primeira vez.
Não é preciso saber programar, mas é preciso ter paciência para seguir os passos
na ordem — cada seção termina com um teste, e só faz sentido seguir adiante
quando o teste passa.

**Antes de começar**, instale o Node.js 20 ou superior em todas as quatro
máquinas — veja como na seção 0 abaixo.

Ao longo do guia você vai anotar algumas informações. Deixe um papel ou um bloco
de notas aberto para: os endereços de IP de cada máquina, o token do Holyrics de
cada máquina, a senha do WebSocket do OBS e o token dos agentes.

---

## 0. Instalar o Node.js

O Node é o programa que faz o hub e os agentes rodarem. Sem ele, `npm install`
e `npm start` não existem no terminal.

### Windows (PC Transmissão, Note Frente, PC Fundo)

1. No navegador da própria máquina, abra **nodejs.org**.
2. A página já destaca um botão verde de download com um número de versão e a
   palavra **LTS** — é esse que você quer (não o "Current"). Clique nele para
   baixar o instalador `.msi`.
3. Abra o arquivo baixado (geralmente em **Downloads**) e clique **Next** em
   todas as telas, aceitando os padrões — não precisa marcar nenhuma opção
   extra. Termine com **Install** e depois **Finish**.
4. Abra o **PowerShell** (tecla Windows, digite `powershell`, Enter) e digite:

   ```powershell
   node -v
   npm -v
   ```

   Se aparecer um número de versão em cada linha (por exemplo `v20.18.0` e
   `10.8.2`), deu certo. Se aparecer "não é reconhecido como um comando",
   feche e abra o PowerShell de novo — às vezes ele só reconhece o Node depois
   de reaberto. Se ainda não reconhecer, reinicie a máquina.

   Se em vez disso aparecer um erro dizendo que **a execução de scripts foi
   desabilitada neste sistema** (mencionando `npm.ps1`), o Windows está
   bloqueando o script do npm por padrão. Resolva rodando:

   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

   Confirme com `S` quando perguntar, e rode `npm -v` de novo. Esse comando
   libera scripts locais (como o do npm) sem abrir mão da proteção contra
   script baixado da internet sem assinatura — é seguro deixar assim.

> Se a máquina não tem acesso à internet para baixar direto, baixe o `.msi` em
> outro computador (no site nodejs.org, procure a versão **LTS para Windows
> x64**) e leve por pendrive.

### Linux (Note Som)

O gerenciador de pacotes padrão do Ubuntu/Debian costuma trazer uma versão do
Node antiga demais para o projeto. Use o repositório oficial do NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Depois confira:

```bash
node -v
npm -v
```

**Teste (as duas plataformas).** `node -v` mostra `v20` ou mais alto, e
`npm -v` mostra algum número. Isso já garante que os passos com `npm install`
mais adiante vão funcionar.

---

## 1. NDI Studio Monitor — liberar o controle pela rede

Isso é o que permite ao Maestro trocar a imagem que cada datashow exibe. Faça em
**cada máquina Windows que recebe imagem** (PC Fundo e PC Transmissão).

1. Abra o **NDI Studio Monitor**.
2. Clique com o botão direito em qualquer lugar da janela para abrir o menu de
   configurações (ou use o ícone de engrenagem, dependendo da versão).
3. Marque **Allow Web Control**.
4. Clique em **Show Web Control URL**. Vai aparecer um endereço como
   `http://192.168.0.22:80`. **Anote a porta.**
   - A primeira janela do Studio Monitor usa a porta **80**.
   - Se a máquina tem uma segunda janela aberta, ela usa a **81**, a terceira a
     **82**, e assim por diante. O PC Fundo, que controla dois destinos, tende a
     ter duas.
5. Libere a porta no firewall:
   - Abra o **Firewall do Windows com Segurança Avançada** (tecla Windows, digite
     "firewall com segurança avançada").
   - **Regras de Entrada** › **Nova Regra...**
   - Escolha **Porta** › **Avançar**.
   - Marque **TCP** e digite a porta (`80`, ou `80,81` se houver duas janelas).
   - **Permitir a conexão** › **Avançar** até **Concluir**. Dê o nome
     `NDI Studio Monitor - Maestro`.

**Teste.** De outra máquina da rede, abra no navegador
`http://<ip-da-maquina>/v1/sources`. Deve aparecer um texto com a lista de fontes
NDI. Se der erro de conexão, o Web Control não está ligado ou o firewall está
bloqueando.

> **Note Som (Linux):** o NDI Studio Monitor faz parte do NDI Tools, que é um
> pacote de Windows — não há o que configurar nessa máquina. Se ela envia ou
> recebe imagem por outro programa, confirme com quem montou a operação antes de
> cadastrá-la no painel.

---

## 2. Holyrics — ativar o API Server

Faça no **Note Frente** e no **PC Fundo**.

1. Abra o **Holyrics**.
2. Menu **Arquivo** › **Configurações**.
3. Procure **API Server** na lista à esquerda.
4. Ative o servidor e anote a porta (o padrão é **8091**).
5. Clique em **gerenciar permissões** e crie um token novo:
   - Dê o nome `maestro`.
   - Marque, na coluna **Local**, estas permissões:
     `GetCurrentPresentation`, `ActionNext`, `ActionPrevious`,
     `ActionGoToIndex`, `CloseCurrentPresentation`, `ShowQuickPresentation`,
     `SetF8`, `SetF9`, `SetF10`.
   - **Anote o token gerado.** Cada máquina tem o seu.
6. Libere a porta 8091 no firewall, do mesmo jeito da seção 1.

Aproveite e anote também a **URL de legenda**: é exatamente o mesmo endereço que
está configurado na fonte de navegador do OBS que mostra a letra na transmissão.
O Maestro usa essa URL para testar as legendas.

**Teste.** De outra máquina, no navegador, abra:
`http://<ip>:8091/api/GetCurrentPresentation?token=<seu-token>`
Deve responder algo com `"status":"ok"`. Se responder `invalid token`, o token
foi copiado errado. Se não responder nada, o API Server está desligado ou o
firewall está bloqueando.

---

## 3. OBS — ativar o WebSocket

Faça só no **PC Transmissão**.

1. Abra o **OBS Studio**.
2. Menu **Ferramentas** › **Configurações do Servidor WebSocket**.
3. Marque **Ativar Servidor WebSocket**.
4. Deixe a porta em **4455** e defina uma senha. **Anote a senha.**
5. Libere a porta 4455 no firewall.

Anote também o **nome exato da fonte de legenda** no OBS (o nome que aparece na
lista de Fontes, respeitando maiúsculas e acentos). O teste de legendas depende
dele.

---

## 4. Hub — instalar no PC Transmissão

O hub é o painel. Ele roda numa máquina só.

1. Abra o **PowerShell** e rode o comando de instalação. Ele baixa a versão
   mais nova do Maestro, instala em `C:\Users\<seu-usuário>\maestro` e compila
   tudo — leva alguns minutos:

   ```powershell
   irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.ps1 | iex
   ```

   Tem que terminar com **Pronto!** em azul. Se aparecer **ERRO** em vermelho,
   a mensagem diz o que fazer.
2. Suba o hub:

   ```powershell
   cd ~\maestro
   npm start
   ```

3. Na primeira vez, o hub cria os arquivos de configuração e mostra no terminal
   uma mensagem sobre o PIN padrão. Pare o hub (`Ctrl + C`) e abra
   `C:\Users\<seu-usuário>\maestro\config\hub.json` no Bloco de Notas:

   ```json
   {
     "porta": 8700,
     "pin": "1234",
     "segredoSessao": "...",
     "tokenAgentes": "...",
     "intervaloPollingMs": 2000
   }
   ```

   - **Troque o `pin`** por um número que a equipe vá saber. (Ainda não há tela
     para trocar o PIN pelo painel; é aqui mesmo, e o hub precisa ser reiniciado
     depois.)
   - **Anote o `tokenAgentes`** — ele vai para as quatro máquinas na seção 5.

4. Libere a porta **8700** no firewall.
5. Suba o hub de novo com `npm start` e abra `http://localhost:8700`. Deve
   aparecer a tela de PIN.

**Teste.** Do seu celular, na mesma rede, abra
`http://<ip-do-pc-transmissao>:8700`. Se a tela de PIN aparecer no celular, o
hub está no ar para a equipe toda.

### Subir o hub sozinho ao ligar a máquina

O comando de instalação (passo 1 desta seção) **já cria a tarefa `maestro-hub`**
quando encontra o `config\hub.json`. Se você instalou antes de subir o hub pela
primeira vez, rode o comando de instalação de novo depois de criar o
`hub.json` (ou rode-o com `$env:MAESTRO_HUB=1;` na frente).

O hub sobe **sem janela** ao fazer logon, então ninguém fecha por engano, e
tudo o que ele escreve vai para `maestro\data\hub.log`. Se aparecer um AVISO
de permissão, abra o PowerShell como administrador e rode o comando de novo.
Reinicie a máquina e faça login para confirmar que o painel volta sozinho.

Para parar o hub sem reiniciar a máquina:

```powershell
Stop-ScheduledTask -TaskName "maestro-hub"
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'hub' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

> O limite padrão de 3 dias de execução do Agendador derrubaria o hub no meio da
> semana; o instalador já desliga esse limite. Se criar a tarefa à mão pela tela
> do Agendador, desmarque "Parar a tarefa se ela for
> executada por mais de 3 dias" na aba **Configurações**.

---

## 5. Agentes — instalar nas quatro máquinas

O agente informa ao hub que a máquina está viva, quais programas estão abertos, e
é ele que passa os slides do PowerPoint.

Em **cada máquina**:

1. Rode o comando de instalação. No **PC Transmissão** isso já foi feito na
   seção 4 — pule para o passo 2.
   - Windows (PowerShell):

     ```powershell
     irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.ps1 | iex
     ```

   - Linux (Note Som):

     ```bash
     curl -fsSL https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.sh | bash
     ```

2. Suba o agente:

   ```powershell
   cd ~\maestro
   npm run start:agent
   ```

3. Na primeira execução o agente cria `config/agent.json` e mostra instruções no
   terminal. Pare (`Ctrl + C`) e edite o arquivo:

   ```json
   {
     "dispositivoId": "pc-fundo",
     "hubUrl": "http://192.168.0.20:8700",
     "porta": 8770,
     "token": "cole-aqui-o-tokenAgentes-do-hub",
     "intervaloHeartbeatMs": 10000
   }
   ```

   - `dispositivoId` precisa ser um destes, conforme a máquina:
     `pc-transmissao`, `note-frente`, `pc-fundo`, `note-som`.
   - `hubUrl` é o endereço do PC Transmissão com a porta do hub.
   - `token` é o **mesmo `tokenAgentes`** do `config/hub.json`. É um segredo só,
     igual nas quatro máquinas — não invente um por máquina.

4. Libere a porta **8770** no firewall.

### Windows: subir o agente ao fazer logon

O comando de instalação **já cria a tarefa `maestro-agent`** (sem janela, ao
fazer logon). Se o `config\agent.json` ainda não existe, ele avisa: rode
`npm run start:agent` uma vez para gerar o arquivo, edite (passo 3) e depois
`Start-ScheduledTask -TaskName maestro-agent`, ou simplesmente rode o comando de
instalação de novo.

Em até 10 segundos a máquina fica verde no painel. Sem janela; a saída fica em
`maestro\data\agent.log` — é lá que se olha quando algo der errado.

> **Não configure o agente como serviço do Windows.** Ele precisa rodar dentro da
> sessão da pessoa que está logada, porque é assim que ele consegue enxergar o
> PowerPoint aberto na tela. Como serviço, o controle de slides simplesmente não
> funciona — e sem erro visível.

### Linux (Note Som): subir com o systemd do usuário

Crie `~/.config/systemd/user/maestro-agent.service`:

```ini
[Unit]
Description=Agente Maestro
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/USUARIO/maestro
ExecStart=/usr/bin/node packages/agent/dist/index.js
Restart=on-failure

[Install]
WantedBy=default.target
```

Depois:

```bash
systemctl --user daemon-reload
systemctl --user enable --now maestro-agent
loginctl enable-linger $USER   # mantém o serviço mesmo sem sessão aberta
```

---

## 6. Cadastrar as máquinas no painel

Com tudo no ar, edite `config/devices.json` no PC Transmissão com o que você
anotou. Exemplo do PC Fundo, que é o caso mais completo:

```json
{
  "id": "pc-fundo",
  "nome": "PC Fundo",
  "host": "192.168.0.22",
  "fixarHost": false,
  "servicos": {
    "agente": { "porta": 8770 },
    "holyrics": { "porta": 8091, "token": "TOKEN-DO-HOLYRICS-DESSA-MAQUINA" },
    "ndiMonitor": { "portas": [80, 81] }
  }
}
```

E o PC Transmissão:

```json
{
  "id": "pc-transmissao",
  "nome": "PC Transmissão",
  "host": "192.168.0.20",
  "fixarHost": false,
  "servicos": {
    "agente": { "porta": 8770 },
    "obs": { "porta": 4455, "senha": "SENHA-DO-OBS", "sourceLegenda": "Legenda" }
  }
}
```

E o Note Frente, que é quem gera as legendas:

```json
{
  "id": "note-frente",
  "nome": "Note Frente",
  "host": "192.168.0.21",
  "fixarHost": false,
  "servicos": {
    "agente": { "porta": 8770 },
    "holyrics": {
      "porta": 8091,
      "token": "TOKEN-DO-HOLYRICS-DESSA-MAQUINA",
      "legendaUrl": "http://192.168.0.21:8080/legenda"
    }
  }
}
```

Não é preciso preencher `host` à mão se o agente estiver rodando: com
`fixarHost: false`, o hub aprende o endereço sozinho pelo heartbeat e corrige se
o IP mudar. Deixe `fixarHost: true` só nas máquinas com IP reservado no roteador.

Reinicie o hub depois de editar. Os nomes das fontes NDI usados em
`config/scenarios.json` também precisam ser conferidos: abra a aba **NDI** do
painel e copie os nomes exatamente como aparecem lá.

---

## 7. Ensaio antes do primeiro culto

Faça isso com calma, num dia que não seja domingo:

1. Ligue as quatro máquinas e abra o painel no celular.
2. Confira se as quatro aparecem **online**.
3. Na aba **NDI**, troque a fonte do PC Fundo e confirme, olhando o datashow, que
   a imagem mudou.
4. Na aba **Holyrics**, exiba uma música e passe alguns slides pelo celular.
5. Na aba **PowerPoint**, inicie a apresentação e passe slides.
6. Na aba **Testes**, rode **Testar legendas** com o OBS aberto — o texto de
   teste deve aparecer e sumir sozinho.
7. Rode um **cenário** e confira se tudo foi para o estado esperado.

Só depois de tudo isso passar vale usar o Maestro num culto — e ainda assim,
deixe os checklists impressos à mão nas primeiras semanas.

---

## 8. Atualizar o Maestro

Quando sair uma correção, rode **o mesmo comando de instalação** em cada máquina
(seção 4 no PC Transmissão, seção 5 nas outras). Ele:

- para o hub e o agente se estiverem rodando;
- baixa a versão nova e compila do zero;
- **mantém** o que é daquela máquina: `config/hub.json` (PIN e tokens),
  `config/agent.json`, `config/devices.json`, `config/scenarios.json` e `data/`;
- religa as tarefas `maestro-hub` e `maestro-agent`, se existirem.

A versão instalada fica anotada em `maestro/versao.txt`.

Feche antes os terminais que estiverem abertos dentro da pasta `maestro` — no
Windows, uma pasta em uso não pode ser apagada e o script avisa com **ERRO**.

---

## Problemas comuns

### A máquina aparece offline no painel

- O agente não está rodando: entre na máquina e rode `npm run start:agent` na
  pasta `maestro` para ver a mensagem de erro.
- O `token` do `config/agent.json` está diferente do `tokenAgentes` do
  `config/hub.json`. Eles precisam ser idênticos.
- O `dispositivoId` do agente não existe em `config/devices.json` (confira se não
  há erro de digitação).
- A porta 8770 está bloqueada no firewall daquela máquina.

### As fontes NDI não aparecem na lista

- O **NDI Screen Capture** não está rodando na máquina que deveria enviar a
  imagem. Ele precisa estar aberto para a fonte existir na rede.
- As máquinas estão em redes diferentes (uma no Wi-Fi de visitantes, por
  exemplo). O NDI só enxerga dentro da mesma rede.
- O Studio Monitor está sem **Allow Web Control** — nesse caso o painel nem
  consegue perguntar quais fontes existem.

### O Holyrics responde "invalid token"

- O token foi copiado com um espaço a mais ou faltando um pedaço.
- O token foi criado numa máquina e colado no cadastro da outra: cada Holyrics
  tem o seu.
- A ação usada não está marcada nas permissões do token. O painel diz qual ação
  faltou; volte em **gerenciar permissões** e marque.

### O PowerPoint não avança de slide

- **A causa mais comum:** o agente foi instalado como serviço do Windows em vez
  de tarefa "ao fazer logon". Como serviço ele não enxerga o PowerPoint. Refaça
  a seção 5.
- A apresentação está aberta mas não foi iniciada. O painel avisa isso e oferece
  o botão **Iniciar apresentação**.
- O PowerPoint está com uma caixa de diálogo aberta esperando alguém clicar
  (recuperação de arquivo, aviso de fonte faltando). Resolva na máquina.
- O arquivo foi aberto pelo OneDrive em modo protegido: clique em **Habilitar
  Edição** antes de iniciar a apresentação.

### O teste de legendas diz que a fonte muda sozinha

É um aviso, não um erro: significa que a fonte de legenda no OBS tem animação ou
vídeo por trás, e por isso o teste não consegue provar pela imagem que a legenda
chegou. Confira a olho nu na tela do OBS.
