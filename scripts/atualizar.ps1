# Atualiza o Maestro para a versao aprovada no canal, uma vez por dia, ao fazer logon.
#
# Como as maquinas da igreja so ficam ligadas em dia de culto, a atualizacao
# acontece justamente no dia mais sensivel. Por isso ela:
#   1. so instala o commit que o canal.json aprova (push no main nao chega sozinho);
#   2. baixa e COMPILA numa pasta separada antes de trocar qualquer coisa;
#   3. confere se o hub/agente voltaram, e reverte para a versao anterior se nao voltaram.
#
# Mensagens sem acento: o PowerShell 5.1 le arquivos sem BOM como ANSI.
param([switch]$Forcar)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$repo = 'joaooomarcos/church-maestro'
$destino = Split-Path -Parent $PSScriptRoot
$pastaDados = Join-Path $destino 'data'
$log = Join-Path $pastaDados 'atualizacao.log'
$logComandos = Join-Path $pastaDados 'atualizacao-comandos.log'
$marcador = Join-Path $pastaDados 'ultima-checagem.txt'
$caminhoVersao = Join-Path $destino 'versao.txt'

if (-not (Test-Path $pastaDados)) { New-Item -ItemType Directory -Path $pastaDados | Out-Null }

function Registrar([string]$texto) {
  $linha = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $texto"
  Add-Content -Path $log -Value $linha
  Write-Host $linha
}

function Curto([string]$sha) {
  if (-not $sha) { return 'desconhecida' }
  return $sha.Substring(0, [Math]::Min(7, $sha.Length))
}

<#
  npm e robocopy escrevem em stderr mesmo quando dao certo, e com
  ErrorActionPreference=Stop isso viraria excecao. Aqui a saida vai para o log
  de comandos e o que importa e o codigo de saida.
#>
function RodarComando([string]$programa, [string[]]$argumentos, [string]$pastaDeTrabalho) {
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $local = Get-Location
  try {
    if ($pastaDeTrabalho) { Set-Location $pastaDeTrabalho }
    Add-Content -Path $logComandos -Value "`n--- $(Get-Date -Format 'HH:mm:ss') $programa $($argumentos -join ' ')"
    & $programa @argumentos 2>&1 | Out-File -FilePath $logComandos -Append -Encoding UTF8
    return $LASTEXITCODE
  } finally {
    Set-Location $local
    $ErrorActionPreference = $anterior
  }
}

function ShaInstalado() {
  if (-not (Test-Path $caminhoVersao)) { return '' }
  $conteudo = (Get-Content $caminhoVersao -Raw).Trim()
  return ($conteudo -split '\s+')[0]
}

# raw.githubusercontent guarda cache por alguns minutos; a query quebra o cache.
function ObterCanal() {
  $url = "https://raw.githubusercontent.com/$repo/main/canal.json?t=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
  for ($tentativa = 1; $tentativa -le 10; $tentativa++) {
    try {
      return Invoke-RestMethod -Uri $url -TimeoutSec 15 -UseBasicParsing
    } catch {
      # O logon costuma acontecer antes do wi-fi conectar: espera e tenta de novo.
      Start-Sleep -Seconds 15
    }
  }
  return $null
}

function PararMaestro() {
  foreach ($tarefa in 'maestro-hub', 'maestro-agent') {
    if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) {
      Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
    }
  }
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'packages[\\/](hub|agent)[\\/]dist' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 2
}

function SubirMaestro() {
  foreach ($tarefa in 'maestro-hub', 'maestro-agent') {
    if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) {
      Start-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
    }
  }
}

function Responde([string]$url, [int]$segundos) {
  $limite = (Get-Date).AddSeconds($segundos)
  while ((Get-Date) -lt $limite) {
    try {
      Invoke-RestMethod -Uri $url -TimeoutSec 3 -UseBasicParsing | Out-Null
      return $true
    } catch {
      Start-Sleep -Seconds 3
    }
  }
  return $false
}

# Confere o que esta maquina deveria estar servindo: o painel (se for o hub) e o agente.
function Verificar() {
  $ok = $true
  if (Test-Path (Join-Path $destino 'config\hub.json')) {
    if (Responde 'http://127.0.0.1:8700/health' 90) {
      Registrar 'ok: o painel respondeu'
    } else {
      Registrar 'FALHA: o painel nao respondeu depois da troca'
      $ok = $false
    }
  }
  if (Test-Path (Join-Path $destino 'config\agent.json')) {
    if (Responde 'http://127.0.0.1:8770/health' 60) {
      Registrar 'ok: o agente respondeu'
    } else {
      Registrar 'FALHA: o agente nao respondeu depois da troca'
      $ok = $false
    }
  }
  return $ok
}

<#
  Baixa e compila o commit numa pasta temporaria e, so se compilar, espelha por
  cima da instalacao (preservando config\ e data\). Devolve $true se trocou.
#>
function InstalarSha([string]$sha, [string]$notas) {
  $tmp = Join-Path ([IO.Path]::GetTempPath()) ('maestro-att-' + [guid]::NewGuid().ToString('N'))
  try {
    New-Item -ItemType Directory -Path $tmp | Out-Null

    Registrar "baixando $(Curto $sha)"
    $zip = Join-Path $tmp 'codigo.zip'
    Invoke-WebRequest -Uri "https://codeload.github.com/$repo/zip/$sha" -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'extraido')
    $origem = (Get-ChildItem (Join-Path $tmp 'extraido') -Directory | Select-Object -First 1).FullName

    Registrar 'instalando dependencias e compilando numa pasta separada'
    if ((RodarComando 'npm.cmd' @('ci', '--no-audit', '--no-fund') $origem) -ne 0) {
      Registrar 'FALHA: npm ci nao terminou; nada foi trocado'
      return $false
    }
    if ((RodarComando 'npm.cmd' @('run', 'build') $origem) -ne 0) {
      Registrar 'FALHA: a compilacao quebrou; nada foi trocado'
      return $false
    }

    Registrar 'parando o Maestro para trocar os arquivos'
    PararMaestro

    # /MIR deixa a pasta igual a da versao nova (some arquivo velho), menos config e data.
    $codigo = RodarComando 'robocopy' @(
      $origem, $destino, '/MIR',
      '/XD', (Join-Path $destino 'config'), (Join-Path $destino 'data'),
      '/XF', 'versao.txt',
      '/MT:16', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'
    ) $null
    if ($codigo -ge 8) {
      Registrar "FALHA: nao consegui copiar os arquivos (robocopy $codigo)"
      SubirMaestro
      return $false
    }

    Set-Content -Path $caminhoVersao -Value "$sha $notas" -Encoding UTF8
    SubirMaestro
    Registrar "versao trocada para $(Curto $sha) — $notas"
    return $true
  } catch {
    Registrar "FALHA: $($_.Exception.Message)"
    SubirMaestro
    return $false
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# --- daqui para baixo e o fluxo ---

if (-not $Forcar) {
  $hoje = (Get-Date).ToString('yyyy-MM-dd')
  if ((Test-Path $marcador) -and ((Get-Content $marcador -Raw).Trim() -eq $hoje)) {
    exit 0
  }
}

$canal = ObterCanal
if ($null -eq $canal) {
  Registrar 'sem internet para consultar o canal; tento no proximo logon'
  exit 0
}

Set-Content -Path $marcador -Value (Get-Date).ToString('yyyy-MM-dd') -Encoding UTF8

if (-not $canal.ativo) {
  Registrar 'atualizacao automatica desligada no canal'
  exit 0
}

$instalado = ShaInstalado
if ($canal.sha -eq $instalado) {
  Registrar "ja esta na versao aprovada ($(Curto $canal.sha))"
  exit 0
}

Registrar "versao aprovada: $(Curto $canal.sha) — $($canal.notas)"
Registrar "instalada aqui:  $(Curto $instalado)"

if (InstalarSha $canal.sha $canal.notas) {
  if (-not (Verificar)) {
    if ($instalado) {
      Registrar 'revertendo para a versao anterior'
      if ((InstalarSha $instalado 'versao anterior (revertida)') -and (Verificar)) {
        Registrar 'revertido: a maquina voltou para a versao anterior'
      } else {
        Registrar 'ATENCAO: nao consegui reverter. Rode o comando de instalacao nesta maquina.'
      }
    } else {
      Registrar 'ATENCAO: sem versao anterior conhecida para reverter.'
    }
  }
}
