# Instala ou atualiza o Maestro nesta maquina Windows.
# Uso (PowerShell):
#   irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/instalar.ps1 | iex
# Mensagens sem acento de proposito: o PowerShell 5.1 le arquivos sem BOM como ANSI.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

  $repo = 'joaooomarcos/church-maestro'
  $branch = if ($env:MAESTRO_BRANCH) { $env:MAESTRO_BRANCH } else { 'main' }
  $destino = if ($env:MAESTRO_DIR) { $env:MAESTRO_DIR } else { Join-Path $HOME 'maestro' }
  $preservar = @('config\hub.json', 'config\agent.json', 'config\devices.json', 'config\scenarios.json', 'data')
  $tarefas = @('maestro-hub', 'maestro-agent')

  function Passo([string]$texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
  function Falha([string]$texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; throw $texto }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('maestro-' + [guid]::NewGuid().ToString('N'))
  $backup = Join-Path $tmp 'preservado'

  try {
    Passo 'Conferindo o Node.js'
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
      Falha 'Node.js nao encontrado. Instale o Node LTS (secao 0 do guia) e abra um PowerShell novo.'
    }
    $versaoNode = (& node -v).Trim()
    if ([int]($versaoNode.TrimStart('v').Split('.')[0]) -lt 20) {
      Falha "Node $versaoNode e antigo demais. Instale o Node LTS 20 ou superior."
    }
    Write-Host "Node $versaoNode"

    $pacote = Join-Path $destino 'package.json'
    if ((Test-Path $destino) -and (Get-ChildItem $destino -Force | Select-Object -First 1)) {
      if (-not ((Test-Path $pacote) -and ((Get-Content $pacote -Raw) -match '"name":\s*"maestro"'))) {
        Falha "A pasta $destino ja existe e nao parece ser uma instalacao do Maestro. Mova ou renomeie essa pasta e rode de novo."
      }
    }

    New-Item -ItemType Directory -Path $tmp | Out-Null

    $versao = ''
    $ref = "refs/heads/$branch"
    try {
      $commit = Invoke-RestMethod -Uri "https://api.github.com/repos/$repo/commits/$branch" -UseBasicParsing
      $ref = $commit.sha
      $versao = $commit.sha.Substring(0, 7) + ' ' + $commit.commit.message.Split("`n")[0]
    } catch { }

    Passo "Baixando a versao mais nova ($branch)"
    $zip = Join-Path $tmp 'maestro.zip'
    Invoke-WebRequest -Uri "https://codeload.github.com/$repo/zip/$ref" -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'codigo')
    $origem = (Get-ChildItem (Join-Path $tmp 'codigo') -Directory | Select-Object -First 1).FullName

    Passo 'Parando o Maestro, se estiver rodando'
    foreach ($tarefa in $tarefas) {
      if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $tarefa }
    }
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
      Where-Object { $_.CommandLine -match 'packages[\\/](hub|agent)[\\/]dist' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host "parado: processo $($_.ProcessId)" }

    Set-Location $HOME

    if (Test-Path $destino) {
      Passo 'Guardando as configuracoes desta maquina'
      foreach ($item in $preservar) {
        $de = Join-Path $destino $item
        if (Test-Path $de) {
          $para = Join-Path $backup $item
          New-Item -ItemType Directory -Force -Path (Split-Path $para) | Out-Null
          Copy-Item -Path $de -Destination $para -Recurse -Force
          Write-Host "guardado: $item"
        }
      }
      # rmdir nao segue os links (junctions) que o npm cria em node_modules; Remove-Item do PS 5.1 segue.
      cmd /c rmdir /s /q "`"$destino`""
      if ((Test-Path $destino) -and (Get-ChildItem $destino -Force | Select-Object -First 1)) {
        Falha "Nao consegui apagar a versao antiga em $destino. Feche janelas e terminais abertos nessa pasta e rode de novo."
      }
    }

    Passo "Instalando em $destino"
    New-Item -ItemType Directory -Force -Path $destino | Out-Null
    Copy-Item -Path (Join-Path $origem '*') -Destination $destino -Recurse -Force
    foreach ($item in $preservar) {
      $de = Join-Path $backup $item
      if (Test-Path $de) {
        $para = Join-Path $destino $item
        if (Test-Path $para) { Remove-Item $para -Recurse -Force }
        New-Item -ItemType Directory -Force -Path (Split-Path $para) | Out-Null
        Copy-Item -Path $de -Destination $para -Recurse -Force
      }
    }

    Set-Location $destino

    Passo 'Instalando dependencias (npm ci)'
    & npm.cmd ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Falha 'npm ci falhou. Confira a internet desta maquina e rode o comando de novo.' }

    Passo 'Compilando (npm run build)'
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { Falha 'A compilacao falhou. Copie as mensagens acima e mande para quem mantem o Maestro.' }

    if ($versao) { Set-Content -Path (Join-Path $destino 'versao.txt') -Value $versao -Encoding UTF8 }

    Passo 'Liberando as portas do Maestro no firewall'
    foreach ($regra in @(@{ Nome = 'Maestro hub'; Porta = 8700 }, @{ Nome = 'Maestro agente'; Porta = 8770 })) {
      try {
        if (-not (Get-NetFirewallRule -DisplayName $regra.Nome -ErrorAction SilentlyContinue)) {
          New-NetFirewallRule -DisplayName $regra.Nome -Direction Inbound -Protocol TCP -LocalPort $regra.Porta -Action Allow | Out-Null
          Write-Host "porta $($regra.Porta) liberada"
        } else {
          Write-Host "porta $($regra.Porta) ja estava liberada"
        }
      } catch {
        Write-Host "AVISO: nao consegui liberar a porta $($regra.Porta). Abra o PowerShell como administrador e rode a instalacao de novo." -ForegroundColor Yellow
      }
    }

    $vbs = Join-Path $destino 'scripts\iniciar-oculto.vbs'
    $regras = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

    # Tarefa "ao fazer logon" rodando o lancador VBS: sobe sem janela, ninguem fecha sem querer.
    function CriarTarefa([string]$nome, [string]$arg) {
      try {
        if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
          Unregister-ScheduledTask -TaskName $nome -Confirm:$false
        }
        $acao = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}" {1}' -f $vbs, $arg) -WorkingDirectory $destino
        Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $regras | Out-Null
        Start-ScheduledTask -TaskName $nome
        Write-Host "tarefa $nome: criada e iniciada"
        return $true
      } catch {
        Write-Host "AVISO: nao consegui criar a tarefa ${nome}: $($_.Exception.Message). Abra o PowerShell como administrador e rode o comando de instalacao de novo." -ForegroundColor Yellow
        return $false
      }
    }

    $caminhoHub = Join-Path $destino 'config\hub.json'
    $ehHub = $env:MAESTRO_HUB -eq '1' -or (Test-Path $caminhoHub)
    if (-not $ehHub) {
      Write-Host ''
      $resposta = Read-Host 'Esta maquina e o PC Transmissao, a que roda o painel? (s/N)'
      $ehHub = $resposta -match '^(s|sim|y|yes)$'
    }

    if ($ehHub) {
      Passo 'Subindo o hub (o painel)'
      CriarTarefa 'maestro-hub' 'hub' | Out-Null
      $limite = (Get-Date).AddSeconds(60)
      $noAr = $false
      while ((Get-Date) -lt $limite -and -not $noAr) {
        try {
          $saude = Invoke-RestMethod -Uri 'http://127.0.0.1:8700/health' -TimeoutSec 2 -UseBasicParsing
          $noAr = $saude.servico -eq 'maestro-hub'
        } catch { Start-Sleep -Seconds 2 }
      }
      if ($noAr) {
        Write-Host 'O painel esta no ar em http://localhost:8700'
        # O hub nasce com PIN 1234; trocar aqui evita a edicao manual do hub.json.
        try {
          $hubJson = Get-Content $caminhoHub -Raw | ConvertFrom-Json
          if ($hubJson.pin -eq '1234') {
            Write-Host ''
            Write-Host 'O PIN e a senha que a equipe digita para abrir o painel. O padrao e 1234.'
            $novoPin = Read-Host 'Novo PIN (4 digitos ou mais, Enter para manter 1234)'
            if ($novoPin -and $novoPin.Length -ge 4) {
              $hubJson.pin = $novoPin
              $utf8SemBom = New-Object System.Text.UTF8Encoding($false)
              [IO.File]::WriteAllText($caminhoHub, ($hubJson | ConvertTo-Json -Depth 5), $utf8SemBom)
              Stop-ScheduledTask -TaskName 'maestro-hub' -ErrorAction SilentlyContinue
              Start-ScheduledTask -TaskName 'maestro-hub'
              Write-Host 'PIN trocado.'
            }
          }
        } catch {
          Write-Host "AVISO: nao consegui ler ou gravar $caminhoHub. Troque o PIN a mao depois." -ForegroundColor Yellow
        }
      } else {
        Write-Host 'AVISO: o hub nao respondeu em 60s. Veja data\hub.log nesta pasta.' -ForegroundColor Yellow
      }
    }

    if (-not (Test-Path (Join-Path $destino 'config\agent.json'))) {
      Passo 'Configurando esta maquina'
      Write-Host 'O assistente procura o hub e pergunta o que esta maquina faz. Leva uns 2 minutos.'
      Write-Host ''
      & npm.cmd run setup
      if ($LASTEXITCODE -ne 0) {
        Write-Host 'AVISO: o assistente nao terminou. Rode "npm run setup" nesta pasta quando puder.' -ForegroundColor Yellow
      }
    }

    if (Test-Path (Join-Path $destino 'config\agent.json')) {
      Passo 'Subindo o agente'
      CriarTarefa 'maestro-agent' 'agent' | Out-Null
    }

    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

    Passo "Pronto! Versao: $(if ($versao) { $versao } else { 'desconhecida' })"
    Write-Host "Pasta: $destino"
    Write-Host ''
    Write-Host 'Painel:            http://localhost:8700 (ou o IP do PC Transmissao)'
    Write-Host 'Reconfigurar:      npm.cmd run setup'
    Write-Host 'Logs:              data\hub.log e data\agent.log'
    Write-Host ''
    Write-Host 'Para atualizar depois, rode o mesmo comando de instalacao.'
  } catch {
    if (Test-Path $backup) {
      Write-Host "`nAs configuracoes desta maquina estao guardadas em: $backup" -ForegroundColor Yellow
    }
    throw
  }
}
