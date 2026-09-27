# Remove o Maestro desta maquina Windows, para instalar do zero depois.
# Uso (PowerShell como administrador):
#   irm https://raw.githubusercontent.com/joaooomarcos/church-maestro/main/scripts/desinstalar.ps1 | iex
#
# Nao mexe no Node, no Holyrics, no OBS nem no NDI: so no que o Maestro criou.
# A pasta config e guardada ao lado (maestro-config-antiga-...) por seguranca.
# Mensagens sem acento de proposito: o PowerShell 5.1 le arquivos sem BOM como ANSI.
& {
  $ErrorActionPreference = 'Stop'
  $destino = if ($env:MAESTRO_DIR) { $env:MAESTRO_DIR } else { Join-Path $HOME 'maestro' }
  $tarefas = @('maestro-hub', 'maestro-agent', 'maestro-update')

  function Passo([string]$texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
  function Aviso([string]$texto) { Write-Host "AVISO: $texto" -ForegroundColor Yellow }

  $ehAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $ehAdmin) {
    Aviso 'PowerShell sem administrador: as regras de firewall do Maestro nao vao ser removidas.'
  }

  Passo 'Removendo as tarefas agendadas'
  foreach ($tarefa in $tarefas) {
    if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) {
      Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
      Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false
      Write-Host "removida: $tarefa"
    }
  }

  Passo 'Parando o Maestro'
  # Pega tanto o que a tarefa subiu quanto um "npm start" deixado aberto numa janela.
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'wscript.exe'" |
    Where-Object {
      $_.CommandLine -match 'packages[\\/](hub|agent)[\\/]' -or
      $_.CommandLine -match 'iniciar-oculto\.vbs' -or
      ($_.CommandLine -and $_.CommandLine.Contains($destino))
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
      Write-Host "parado: processo $($_.ProcessId)"
    }
  Start-Sleep -Seconds 2

  Set-Location $HOME

  if (Test-Path $destino) {
    $pacote = Join-Path $destino 'package.json'
    $ehMaestro = (Test-Path $pacote) -and ((Get-Content $pacote -Raw) -match '"name":\s*"maestro"')
    if (-not $ehMaestro) {
      Aviso "A pasta $destino nao parece ser do Maestro. Nao apaguei nada nela."
    } else {
      $config = Join-Path $destino 'config'
      if (Test-Path $config) {
        $copia = Join-Path $HOME ('maestro-config-antiga-' + (Get-Date -Format 'yyyyMMdd-HHmm'))
        Passo "Guardando a configuracao antiga em $copia"
        Copy-Item -Path $config -Destination $copia -Recurse -Force
      }

      Passo "Apagando $destino"
      # rmdir nao segue os links (junctions) do node_modules; Remove-Item do PS 5.1 segue.
      cmd /c rmdir /s /q "`"$destino`""
      if (Test-Path $destino) {
        Aviso "Nao consegui apagar tudo em $destino. Feche janelas e terminais abertos nessa pasta e rode de novo."
      } else {
        Write-Host 'pasta apagada'
      }
    }
  } else {
    Write-Host "nao ha pasta $destino"
  }

  Passo 'Removendo o atalho da area de trabalho'
  $atalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Maestro - Compartilhar.url'
  if (Test-Path $atalho) {
    Remove-Item $atalho -Force
    Write-Host 'atalho removido'
  } else {
    Write-Host 'nao havia atalho'
  }

  if ($ehAdmin) {
    Passo 'Removendo as regras de firewall do Maestro'
    # Pega as do instalador (8700/8770) e as que o guia manda criar para
    # Holyrics, OBS e NDI - todas levam "Maestro" no nome.
    $regras = Get-NetFirewallRule -DisplayName '*Maestro*' -ErrorAction SilentlyContinue
    if ($regras) {
      foreach ($regra in $regras) {
        Remove-NetFirewallRule -Name $regra.Name
        Write-Host "removida: $($regra.DisplayName)"
      }
    } else {
      Write-Host 'nenhuma regra do Maestro'
    }
  }

  Passo 'Pronto: o Maestro saiu desta maquina.'
  Write-Host 'Node, Holyrics, OBS e NDI continuam instalados e configurados.'
  Write-Host 'Para instalar de novo, siga o guia a partir da secao 1 (PC Transmissao primeiro).'
}
