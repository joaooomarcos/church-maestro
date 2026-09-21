# Abre, fecha e traz para frente os programas da operacao, e descobre onde eles
# estao instalados. Chamado de forma avulsa (nao e ponte persistente): estas
# acoes vem de um toque no painel, entao os ~300ms de abrir um powershell nao
# incomodam.
#
# ATENCAO: arquivo em ASCII puro de proposito. O PowerShell 5.1 le .ps1 sem BOM
# como ANSI, e acentos aqui viram lixo. Texto para o usuario fica no TypeScript.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('localizar', 'abrir', 'fechar', 'frente', 'tecla')]
    [string]$Acao,
    [string]$Caminho = '',
    [string]$Processos = '',
    [ValidateSet('', 'RIGHT', 'LEFT')]
    [string]$Tecla = ''
)

$ErrorActionPreference = 'Stop'

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MaestroApps {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@

# Onde cada programa costuma estar. O primeiro que existir, vale. Os curingas
# cobrem as versoes do NDI Tools (NDI 5, NDI 6...) e do Office.
$CATALOGO = @{
    'holyrics'           = @(
        'C:\Holyrics\Holyrics.exe',
        "$env:ProgramFiles\Holyrics\Holyrics.exe",
        "${env:ProgramFiles(x86)}\Holyrics\Holyrics.exe",
        "$env:LOCALAPPDATA\Holyrics\Holyrics.exe"
    )
    'obs'                = @(
        "$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe",
        "${env:ProgramFiles(x86)}\obs-studio\bin\64bit\obs64.exe"
    )
    'powerpoint'         = @(
        "$env:ProgramFiles\Microsoft Office\root\Office16\POWERPNT.EXE",
        "${env:ProgramFiles(x86)}\Microsoft Office\root\Office16\POWERPNT.EXE",
        "$env:ProgramFiles\Microsoft Office\Office16\POWERPNT.EXE"
    )
    'ndi-studio-monitor' = @(
        "$env:ProgramFiles\NDI\*\Studio Monitor\*Studio Monitor*.exe",
        "$env:ProgramFiles\NDI\*\*Studio Monitor*.exe",
        "${env:ProgramFiles(x86)}\NDI\*\Studio Monitor\*Studio Monitor*.exe"
    )
    'ndi-screen-capture' = @(
        "$env:ProgramFiles\NDI\*\Screen Capture\*Screen Capture*.exe",
        "$env:ProgramFiles\NDI\*\*Screen Capture*.exe",
        "${env:ProgramFiles(x86)}\NDI\*\Screen Capture\*Screen Capture*.exe"
    )
}

# Nome que aparece no atalho do Menu Iniciar, para quando o programa estiver
# instalado fora dos caminhos acima.
$ATALHOS = @{
    'holyrics'           = 'Holyrics'
    'obs'                = 'OBS Studio'
    'powerpoint'         = 'PowerPoint'
    'ndi-studio-monitor' = 'Studio Monitor'
    'ndi-screen-capture' = 'Screen Capture'
}

function Resolver-Curinga($padrao) {
    if ($padrao -notmatch '\*') {
        if (Test-Path -LiteralPath $padrao) { return $padrao }
        return $null
    }
    $achados = Get-ChildItem -Path $padrao -ErrorAction SilentlyContinue | Sort-Object FullName -Descending
    if ($achados) { return $achados[0].FullName }
    return $null
}

function Buscar-NoMenuIniciar($nome) {
    if (-not $nome) { return $null }
    $pastas = @(
        "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
        "$env:APPDATA\Microsoft\Windows\Start Menu\Programs"
    )
    $shell = New-Object -ComObject WScript.Shell
    foreach ($pasta in $pastas) {
        if (-not (Test-Path -LiteralPath $pasta)) { continue }
        $atalhos = Get-ChildItem -Path $pasta -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.BaseName -like "*$nome*" }
        foreach ($atalho in $atalhos) {
            try {
                $alvo = $shell.CreateShortcut($atalho.FullName).TargetPath
                if ($alvo -and (Test-Path -LiteralPath $alvo) -and $alvo -like '*.exe') { return $alvo }
            } catch { }
        }
    }
    return $null
}

function Localizar-Todos {
    $resultado = @{}
    foreach ($app in $CATALOGO.Keys) {
        $encontrado = $null
        foreach ($padrao in $CATALOGO[$app]) {
            $encontrado = Resolver-Curinga $padrao
            if ($encontrado) { break }
        }
        if (-not $encontrado) { $encontrado = Buscar-NoMenuIniciar $ATALHOS[$app] }
        $resultado[$app] = $encontrado
    }
    return $resultado
}

function Obter-Processos($lista) {
    $nomes = $lista -split ',' | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ }
    if (-not $nomes) { return @() }
    return Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $nome = $_.ProcessName.ToLower()
        $nomes | Where-Object { $nome -like "*$_*" }
    }
}

function Trazer-ParaFrente($processos) {
    $trouxe = $false
    foreach ($processo in $processos) {
        $janela = $processo.MainWindowHandle
        if ($janela -eq [IntPtr]::Zero) { continue }
        if ([MaestroApps]::IsIconic($janela)) {
            # 9 = SW_RESTORE: janela minimizada nao aceita foco.
            [void][MaestroApps]::ShowWindow($janela, 9)
        }
        if ([MaestroApps]::SetForegroundWindow($janela)) { $trouxe = $true }
    }
    return $trouxe
}

try {
    switch ($Acao) {
        'localizar' {
            $dados = Localizar-Todos
        }
        'abrir' {
            if (-not $Caminho -or -not (Test-Path -LiteralPath $Caminho)) {
                throw "caminho-invalido"
            }
            $processo = Start-Process -FilePath $Caminho -PassThru
            $dados = @{ pid = $processo.Id }
        }
        'fechar' {
            $processos = Obter-Processos $Processos
            if (-not $processos) { throw "nao-esta-aberto" }
            foreach ($processo in $processos) {
                # CloseMainWindow e o mesmo que clicar no X: o programa ainda
                # pode perguntar se quer salvar. Nada de matar a forca aqui.
                [void]$processo.CloseMainWindow()
            }
            Start-Sleep -Milliseconds 800
            $restantes = (Obter-Processos $Processos | Measure-Object).Count
            $dados = @{ fechados = ($processos | Measure-Object).Count; restantes = $restantes }
        }
        'frente' {
            $processos = Obter-Processos $Processos
            if (-not $processos) { throw "nao-esta-aberto" }
            $dados = @{ trouxe = (Trazer-ParaFrente $processos) }
        }
        'tecla' {
            if (-not $Tecla) { throw "tecla-invalida" }
            $processos = Obter-Processos $Processos
            if (-not $processos) { throw "nao-esta-aberto" }
            if (-not (Trazer-ParaFrente $processos)) { throw "nao-consegui-focar" }
            # A janela leva um instante para assumir o foco; sem esta pausa a
            # tecla chega na janela anterior.
            Start-Sleep -Milliseconds 250
            $wshell = New-Object -ComObject WScript.Shell
            $wshell.SendKeys("{$Tecla}")
            $dados = @{ enviou = $Tecla }
        }
    }
    [Console]::Out.WriteLine((@{ ok = $true; dados = $dados } | ConvertTo-Json -Compress -Depth 5))
} catch {
    [Console]::Out.WriteLine((@{ ok = $false; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
}
