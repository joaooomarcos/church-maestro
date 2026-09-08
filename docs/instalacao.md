# Instalação do Maestro

Guia para quem vai montar o Maestro nas máquinas da igreja pela primeira vez.
Não é preciso saber programar, mas é preciso ter paciência para seguir os passos
na ordem — cada seção termina com um teste, e só faz sentido seguir adiante
quando o teste passa.

**Antes de começar**, instale o [Node.js 20 ou superior](https://nodejs.org) em
todas as quatro máquinas.

Ao longo do guia você vai anotar algumas informações. Deixe um papel ou um bloco
de notas aberto para: os endereços de IP de cada máquina, o token do Holyrics de
cada máquina, a senha do WebSocket do OBS e o token dos agentes.

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

1. Copie a pasta do projeto para o PC Transmissão, por exemplo em `C:\maestro`.
2. Abra o **PowerShell** e rode:

   ```powershell
   cd C:\maestro
   npm install
   npm run build
   npm start
   ```

3. Na primeira vez, o hub cria os arquivos de configuração e mostra no terminal
   uma mensagem sobre o PIN padrão. Pare o hub (`Ctrl + C`) e abra
   `C:\maestro\config\hub.json` no Bloco de Notas:

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

1. Abra o **Agendador de Tarefas** (tecla Windows, digite `taskschd.msc`).
2. **Criar Tarefa...** (não "Criar Tarefa Básica" — precisamos das abas).
3. Aba **Geral**: nome `maestro-hub`. Deixe **Executar com privilégios mais
   elevados** desmarcado.
4. Aba **Disparadores**: **Novo...** › **Ao fazer logon** › OK.
5. Aba **Ações**: **Novo...** › Iniciar um programa:
   - Programa: `node`
   - Argumentos: `packages\hub\dist\index.js`
   - Iniciar em: `C:\maestro`
6. Aba **Condições**: desmarque "Iniciar a tarefa somente se o computador
   estiver ligado na energia" (senão a tarefa não roda em notebook na bateria).

---

## 5. Agentes — instalar nas quatro máquinas

O agente informa ao hub que a máquina está viva, quais programas estão abertos, e
é ele que passa os slides do PowerPoint.

Em **cada máquina**:

1. Copie a pasta do projeto (por exemplo `C:\maestro`, ou `~/maestro` no Linux).
2. No terminal:

   ```powershell
   cd C:\maestro
   npm install
   npm run build
   npm run dev:agent
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

Mesmo procedimento do hub (seção 4), com nome `maestro-agent` e argumentos
`packages\agent\dist\index.js`.

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

## Problemas comuns

### A máquina aparece offline no painel

- O agente não está rodando: entre na máquina e rode `npm run dev:agent` no
  terminal para ver a mensagem de erro.
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
