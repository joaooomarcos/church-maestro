# Abre, fecha e traz para frente os programas da operacao, e descobre onde eles
# estao instalados. Chamado de forma avulsa (nao e ponte persistente): estas
# acoes vem de um toque no painel, entao os ~300ms de abrir um powershell nao
# incomodam.
#
# ATENCAO: arquivo em ASCII puro de proposito. O PowerShell 5.1 le .ps1 sem BOM
# como ANSI, e acentos aqui viram lixo. Texto para o usuario fica no TypeScript.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('localizar', 'abrir', 'fechar', 'frente', 'tecla', 'acordar')]
    [string]$Acao,
    [string]$Caminho = '',
    [string]$Processos = '',
    [ValidateSet('', 'RIGHT', 'LEFT')]
    [string]$Tecla = ''
)

$ErrorActionPreference = 'Stop'
# Windows em portugues escreve na pagina de codigo do console, e o Node le UTF-8:
# sem isto os acentos dos titulos e das mensagens de erro chegam quebrados.
# Sem BOM, senao a linha deixa de ser um JSON valido.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class MaestroApps {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);

  // Janelas de topo, visiveis e com titulo, do processo. Process.MainWindowHandle
  // erra com programas que abrem uma janela auxiliar antes da principal (Java,
  // Electron): vem zerado ou aponta para uma janela escondida.
  public static List<IntPtr> JanelasDoProcesso(uint pidAlvo) {
    List<IntPtr> achadas = new List<IntPtr>();
    EnumWindows(delegate (IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid == pidAlvo && IsWindowVisible(h) && GetWindowTextLength(h) > 0 && GetWindow(h, 4) == IntPtr.Zero) {
        achadas.Add(h);
      }
      return true;
    }, IntPtr.Zero);
    return achadas;
  }

  // O Windows so deixa trazer uma janela para frente a quem acabou de receber
  // input do usuario; um processo solto (como este) so faz a janela piscar na
  // barra de tarefas. O toque no Alt e a ligacao com a thread da janela que
  // esta na frente sao o jeito de contornar isso. Devolve se a janela ficou
  // mesmo na frente, em vez de confiar no retorno de SetForegroundWindow.
  public static bool Forcar(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    IntPtr frente = GetForegroundWindow();
    if (frente == h) return true;
    uint pidFrente;
    uint threadFrente = GetWindowThreadProcessId(frente, out pidFrente);
    uint minhaThread = GetCurrentThreadId();
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    bool ligou = false;
    if (threadFrente != 0 && threadFrente != minhaThread) ligou = AttachThreadInput(minhaThread, threadFrente, true);
    BringWindowToTop(h);
    ShowWindow(h, 5);
    SetForegroundWindow(h);
    if (ligou) AttachThreadInput(minhaThread, threadFrente, false);
    return GetForegroundWindow() == h;
  }
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
    # O executavel do NDI Tools nao leva o nome da pasta: e
    # "Application.Network.StudioMonitor.x64.exe", e o Screen Capture ainda usa
    # o nome antigo, "Application.Network.ScanConverter2.x64.exe".
    'ndi-studio-monitor' = @(
        "$env:ProgramFiles\NDI\*\Studio Monitor\*StudioMonitor*.exe",
        "$env:ProgramFiles\NDI\*\Studio Monitor\*Studio Monitor*.exe",
        "${env:ProgramFiles(x86)}\NDI\*\Studio Monitor\*StudioMonitor*.exe"
    )
    'ndi-screen-capture' = @(
        "$env:ProgramFiles\NDI\*\Screen Capture\*ScanConverter*.exe",
        "$env:ProgramFiles\NDI\*\Screen Capture\*ScreenCapture*.exe",
        "$env:ProgramFiles\NDI\*\Screen Capture\*Screen Capture*.exe",
        "${env:ProgramFiles(x86)}\NDI\*\Screen Capture\*ScanConverter*.exe"
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
        # Nome exato primeiro: "Screen Capture" nao pode pegar "Screen Capture HX".
        $atalhos = Get-ChildItem -Path $pasta -Filter '*.lnk' -Recurse -ErrorAction SilentlyContinue |
            Where-Object { $_.BaseName -like "*$nome*" } |
            Sort-Object { if ($_.BaseName -eq $nome) { 0 } else { 1 } }
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

# Compara so letras e numeros, como o agente: "Application.Network.StudioMonitor.x64"
# vira "applicationnetworkstudiomonitorx64" e casa com "studiomonitor".
function Obter-Processos($lista) {
    $nomes = $lista -split ',' | ForEach-Object { $_.Trim().ToLower() -replace '[^a-z0-9]', '' } | Where-Object { $_ }
    if (-not $nomes) { return @() }
    return Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $nome = $_.ProcessName.ToLower() -replace '[^a-z0-9]', ''
        $nomes | Where-Object { $nome.Contains($_) }
    }
}

function Trazer-ParaFrente($lista) {
    $trouxe = $false
    foreach ($processo in $lista) {
        $janelas = @([MaestroApps]::JanelasDoProcesso([uint32]$processo.Id))
        # Processo sem janela (servico, instancia em segundo plano): nada a focar.
        if ($janelas.Count -eq 0 -and $processo.MainWindowHandle -ne [IntPtr]::Zero) {
            $janelas = @($processo.MainWindowHandle)
        }
        foreach ($janela in $janelas) {
            if ([MaestroApps]::Forcar($janela)) { $trouxe = $true; break }
        }
        if ($trouxe) { break }
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
            $alvos = @(Obter-Processos $Processos)
            if ($alvos.Count -eq 0) { throw "nao-esta-aberto" }
            foreach ($processo in $alvos) {
                # CloseMainWindow e o mesmo que clicar no X: o programa ainda
                # pode perguntar se quer salvar. Nada de matar a forca aqui.
                [void]$processo.CloseMainWindow()
            }
            Start-Sleep -Milliseconds 800
            $restantes = (Obter-Processos $Processos | Measure-Object).Count
            $dados = @{ fechados = $alvos.Count; restantes = $restantes }
        }
        'frente' {
            $alvos = @(Obter-Processos $Processos)
            if ($alvos.Count -eq 0) { throw "nao-esta-aberto" }
            # Antes devolvia ok mesmo sem conseguir, e o botao parecia ter funcionado.
            if (-not (Trazer-ParaFrente $alvos)) { throw "nao-consegui-focar" }
            $dados = @{ trouxe = $true }
        }
        'acordar' {
            # Tela apagada por inatividade: um movimento de mouse de 1 pixel (e de
            # volta) e o pedido explicito de "tela ligada" acordam o monitor. Nao
            # destrava a tela de bloqueio: isso exige senha.
            # 3 = ES_SYSTEM_REQUIRED + ES_DISPLAY_REQUIRED, sem ES_CONTINUOUS: so zera o
            # relogio de inatividade, nao segura a tela ligada para sempre.
            [void][MaestroApps]::SetThreadExecutionState(3)
            [MaestroApps]::mouse_event(1, 1, 0, 0, [UIntPtr]::Zero)
            Start-Sleep -Milliseconds 120
            [MaestroApps]::mouse_event(1, -1, 0, 0, [UIntPtr]::Zero)
            [MaestroApps]::keybd_event(0x10, 0, 0, [UIntPtr]::Zero)
            [MaestroApps]::keybd_event(0x10, 0, 2, [UIntPtr]::Zero)
            $dados = @{ acordou = $true }
        }
        'tecla' {
            if (-not $Tecla) { throw "tecla-invalida" }
            $alvos = @(Obter-Processos $Processos)
            if ($alvos.Count -eq 0) { throw "nao-esta-aberto" }
            if (-not (Trazer-ParaFrente $alvos)) { throw "nao-consegui-focar" }
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
