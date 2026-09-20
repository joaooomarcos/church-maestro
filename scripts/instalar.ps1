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

    Passo 'Configurando a subida automatica (tarefas sem janela)'
    $vbs = Join-Path $destino 'scripts\iniciar-oculto.vbs'
    $regras = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
    $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    $alvos = @(@{ Nome = 'maestro-agent'; Arg = 'agent'; Config = 'config\agent.json' })
    if ($env:MAESTRO_HUB -eq '1' -or (Test-Path (Join-Path $destino 'config\hub.json'))) {
      $alvos += @{ Nome = 'maestro-hub'; Arg = 'hub'; Config = 'config\hub.json' }
    }
    foreach ($alvo in $alvos) {
      try {
        if (Get-ScheduledTask -TaskName $alvo.Nome -ErrorAction SilentlyContinue) {
          Unregister-ScheduledTask -TaskName $alvo.Nome -Confirm:$false
        }
        $acao = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"{0}" {1}' -f $vbs, $alvo.Arg) -WorkingDirectory $destino
        Register-ScheduledTask -TaskName $alvo.Nome -Action $acao -Trigger $gatilho -Settings $regras | Out-Null
        if (Test-Path (Join-Path $destino $alvo.Config)) {
          Start-ScheduledTask -TaskName $alvo.Nome
          Write-Host "tarefa $($alvo.Nome): criada e iniciada"
        } else {
          Write-Host "tarefa $($alvo.Nome): criada, mas falta $($alvo.Config). Rode 'npm.cmd run start:$($alvo.Arg)' uma vez, edite o arquivo e depois rode Start-ScheduledTask -TaskName $($alvo.Nome)" -ForegroundColor Yellow
        }
      } catch {
        Write-Host "AVISO: nao consegui criar a tarefa $($alvo.Nome): $($_.Exception.Message). Abra o PowerShell como administrador e rode o comando de instalacao de novo." -ForegroundColor Yellow
      }
    }

    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

    Passo "Pronto! Versao: $(if ($versao) { $versao } else { 'desconhecida' })"
    Write-Host "Pasta: $destino"
    Write-Host ''
    Write-Host 'PC Transmissao (hub):    npm.cmd start'
    Write-Host 'Agente (cada maquina):   npm.cmd run start:agent'
    Write-Host ''
    Write-Host 'Para atualizar depois, rode o mesmo comando de instalacao.'
  } catch {
    if (Test-Path $backup) {
      Write-Host "`nAs configuracoes desta maquina estao guardadas em: $backup" -ForegroundColor Yellow
    }
    throw
  }
}
