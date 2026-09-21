# Maestro

Painel de operação dos cultos da IPB Jacareí. Roda na rede local e se abre no
navegador do celular ou do computador.

## O problema

A operação de um culto envolve quatro máquinas, cada uma com uma pessoa
diferente, e a escala muda toda semana. O que se sabe fazer está em dois
checklists impressos e na memória de quem já operou — então volta e meia alguém
esquece de testar a legenda, esquece de conferir o NDI, e o culto sai fora do
padrão.

O Maestro tira isso da memória das pessoas: mostra o estado real de todas as
máquinas, deixa controlar o que precisa de um celular, e roda os testes de
legenda e de NDI com um toque, dizendo em português onde quebrou e o que fazer.

## As máquinas

| Máquina | Sistema | Função |
| --- | --- | --- |
| PC Transmissão | Windows 11 | OBS, câmeras e YouTube. Hospeda o hub. |
| Note Frente | Windows 11 | Holyrics da projeção da igreja e das legendas do OBS. |
| PC Fundo | Windows 10 | PowerPoint do louvor e Holyrics dos textos de apoio. |
| Note Som | Linux | Som que vai para a transmissão. |

Cada máquina envia a própria tela pelo **NDI Screen Capture** e recebe a tela das
outras pelo **NDI Studio Monitor**.

## Estrutura

```
maestro/
├── packages/
│   ├── shared/   contratos (tipos e schemas) usados pelos três lados
│   ├── hub/      servidor central: drivers, testes, WebSocket
│   ├── web/      painel React, pensado primeiro para celular
│   └── agent/    agente local de cada máquina (status e PowerPoint)
├── config/       hub.json, devices.json, scenarios.json, checklists/
├── manuais/      os checklists em HTML/PDF que deram origem ao projeto
├── scripts/      utilitários de build e conversão
└── docs/         guia de instalação máquina a máquina
```

## Desenvolvimento

Requer Node.js 20 ou superior.

```bash
npm install
npm run build
```

Para desenvolver fora da igreja, o hub sobe com máquinas simuladas — dá para
mexer no painel inteiro sem depender da rede de lá:

```bash
npm run dev
```

O painel fica em `http://localhost:8700` (a porta vem de `config/hub.json`). O
PIN inicial é `1234` e deve ser trocado antes do primeiro culto.

Para trabalhar no front com recarga automática, em outro terminal:

```bash
npm run dev:web
```

Testar num celular é só abrir `http://<ip-do-seu-computador>:8700` na mesma rede.

## Instalar e atualizar nas máquinas da igreja

Não precisa de git nem de copiar pasta à mão. Com o Node.js 20+ instalado, um
comando baixa a versão mais nova do `main`, instala, compila e chama o
assistente de configuração.

Comece pelo **PC Transmissão**: lá o instalador sobe o hub e pergunta o PIN da
equipe. Nas outras máquinas, o assistente acha esse hub sozinho na rede, pergunta
o que a máquina faz (NDI, Holyrics, OBS), testa cada um e cadastra tudo — não há
IP, porta nem token para anotar, e `config/devices.json` é preenchido pelo hub.

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.ps1 | iex
```

Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.sh | bash
```

Instala em `~/maestro` (`C:\Users\<usuário>\maestro` no Windows) e preserva o que
é de cada máquina: `config/hub.json`, `config/agent.json`, `config/devices.json`,
`config/scenarios.json` e `data/`. Para levar uma correção à igreja, faça push no
`main` e rode o mesmo comando em cada máquina — ele para o hub/agente, atualiza e
religa as tarefas agendadas, sem repetir o assistente.

O hub e o agente sobem como tarefa ao fazer logon (Windows) ou serviço do usuário
(Linux), sem janela. Para reconfigurar uma máquina depois — outro nome, outro
serviço — rode `npm run setup` nela. O passo a passo completo, com o que ativar
no NDI, no Holyrics e no OBS, está em [docs/instalacao.md](./docs/instalacao.md).
