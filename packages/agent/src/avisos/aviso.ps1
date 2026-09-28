# Janela de aviso da equipe ("faltam 10 minutos...") e lista de monitores.
#
# A janela fica por cima de tudo, no monitor escolhido no painel, ate alguem
# clicar em "Ok, visto". O monitor importa: um aviso no telao aparece para a
# igreja, e um aviso na tela que o NDI Screen Capture envia vai para a live.
#
# ATENCAO: arquivo em ASCII puro de proposito (o PowerShell 5.1 le .ps1 sem BOM
# como ANSI). A mensagem chega em base64 de UTF-8 pelo mesmo motivo: acentos
# na linha de comando nao sobrevivem a todas as paginas de codigo.
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('monitores', 'mostrar')]
    [string]$Acao,
    [string]$MensagemB64 = '',
    [string]$Monitor = ''
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MaestroAviso {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@

function Listar-Monitores {
    # Sem isto, numa tela com escala de 125% o Windows informa 1536x864 em vez
    # de 1920x1080, e a pessoa nao reconhece o monitor na lista.
    [void][MaestroAviso]::SetProcessDPIAware()
    $lista = @()
    foreach ($tela in [System.Windows.Forms.Screen]::AllScreens) {
        $lista += @{
            id        = $tela.DeviceName
            principal = $tela.Primary
            largura   = $tela.Bounds.Width
            altura    = $tela.Bounds.Height
        }
    }
    return , $lista
}

# Maior fonte em que o texto cabe na caixa: aviso curto fica enorme, aviso
# longo continua legivel sem cortar.
function Fonte-QueCabe($texto, $largura, $altura) {
    $fluxo = [System.Windows.Forms.TextFormatFlags]::WordBreak
    foreach ($tamanho in 30, 26, 22, 19, 16, 14, 12) {
        $fonte = New-Object System.Drawing.Font('Segoe UI', $tamanho)
        $medida = [System.Windows.Forms.TextRenderer]::MeasureText(
            $texto, $fonte, (New-Object System.Drawing.Size($largura, 10000)), $fluxo)
        if ($medida.Height -le $altura) { return $fonte }
        $fonte.Dispose()
    }
    return New-Object System.Drawing.Font('Segoe UI', 11)
}

function Mostrar-Aviso($texto, $idMonitor) {
    $tela = [System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -eq $idMonitor } | Select-Object -First 1
    # Monitor desconectado desde que foi escolhido: melhor o principal do que nada.
    if (-not $tela) { $tela = [System.Windows.Forms.Screen]::PrimaryScreen }
    $area = $tela.WorkingArea

    $largura = [int][Math]::Min(760, $area.Width - 40)
    $altura = 360
    $amarelo = [System.Drawing.Color]::FromArgb(245, 158, 11)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Maestro - aviso'
    $form.FormBorderStyle = 'None'
    $form.TopMost = $true
    $form.ShowInTaskbar = $true
    $form.StartPosition = 'Manual'
    $form.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 27)
    $form.Bounds = New-Object System.Drawing.Rectangle(
        [int]($area.X + ($area.Width - $largura) / 2),
        [int]($area.Y + ($area.Height - $altura) / 2),
        $largura, $altura)

    $faixa = New-Object System.Windows.Forms.Panel
    $faixa.BackColor = $amarelo
    $faixa.Location = New-Object System.Drawing.Point(0, 0)
    $faixa.Size = New-Object System.Drawing.Size($largura, 8)
    $form.Controls.Add($faixa)

    $cabecalho = New-Object System.Windows.Forms.Label
    $cabecalho.Text = 'MAESTRO   |   AVISO DAS ' + (Get-Date -Format 'HH:mm')
    $cabecalho.ForeColor = $amarelo
    $cabecalho.Font = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Bold)
    $cabecalho.Location = New-Object System.Drawing.Point(32, 28)
    $cabecalho.Size = New-Object System.Drawing.Size(($largura - 64), 24)
    $form.Controls.Add($cabecalho)

    $caixaLargura = $largura - 64
    $caixaAltura = $altura - 60 - 110
    $mensagem = New-Object System.Windows.Forms.Label
    $mensagem.Text = $texto
    $mensagem.ForeColor = [System.Drawing.Color]::White
    $mensagem.Font = Fonte-QueCabe $texto $caixaLargura $caixaAltura
    $mensagem.TextAlign = 'MiddleCenter'
    $mensagem.Location = New-Object System.Drawing.Point(32, 60)
    $mensagem.Size = New-Object System.Drawing.Size($caixaLargura, $caixaAltura)
    $form.Controls.Add($mensagem)

    $botao = New-Object System.Windows.Forms.Button
    $botao.Text = 'Ok, visto'
    $botao.FlatStyle = 'Flat'
    $botao.FlatAppearance.BorderSize = 0
    $botao.BackColor = $amarelo
    $botao.ForeColor = [System.Drawing.Color]::Black
    $botao.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
    $botao.Size = New-Object System.Drawing.Size(240, 58)
    $botao.Location = New-Object System.Drawing.Point([int](($largura - 240) / 2), ($altura - 88))
    $botao.Cursor = [System.Windows.Forms.Cursors]::Hand
    $botao.Add_Click({ $form.Close() })
    $form.Controls.Add($botao)

    $form.Add_Shown({
        # O agente roda escondido, e o Windows aplica esse "escondido" ao
        # primeiro ShowWindow do processo: sem este segundo, a janela pode
        # nunca aparecer.
        [void][MaestroAviso]::ShowWindow($form.Handle, 5)
        [void][MaestroAviso]::SetForegroundWindow($form.Handle)
        $form.Activate()
        # Sem foco no botao: um Enter de quem estava digitando nao fecha o aviso sem ser lido.
        $form.ActiveControl = $null
        [System.Media.SystemSounds]::Exclamation.Play()
    })

    [System.Windows.Forms.Application]::EnableVisualStyles()
    [System.Windows.Forms.Application]::Run($form)
}

try {
    switch ($Acao) {
        'monitores' {
            $dados = Listar-Monitores
            [Console]::Out.WriteLine((@{ ok = $true; dados = $dados } | ConvertTo-Json -Compress -Depth 5))
        }
        'mostrar' {
            if (-not $MensagemB64) { throw 'mensagem-vazia' }
            $texto = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($MensagemB64))
            Mostrar-Aviso $texto $Monitor
        }
    }
} catch {
    [Console]::Out.WriteLine((@{ ok = $false; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
}
