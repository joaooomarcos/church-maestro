# Captura de um monitor para a prova real do teste do NDI.
#
# Devolve, em JSON numa unica linha: (1) uma miniatura JPEG de ~480 px de
# largura para a tela do painel mostrar e (2) uma amostra de 64x36 em tons de
# cinza para o hub comparar com a imagem de outra maquina. Tudo fica so em
# memoria: nenhum arquivo de imagem e gravado em disco.
#
# Com a sessao do Windows bloqueada a captura sai preta; quem trata isso e o
# hub (imagem lisa = resultado inconclusivo).
#
# ATENCAO: arquivo em ASCII puro de proposito (o PowerShell 5.1 le .ps1 sem BOM
# como ANSI).
param(
    [string]$Monitor = '',
    [int]$LarguraMiniatura = 480,
    [int]$QualidadeJpeg = 60,
    [int]$LarguraAmostra = 64,
    [int]$AlturaAmostra = 36
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MaestroCaptura {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@

# Sem isto, numa tela com escala de 125% o Windows entrega o monitor reduzido
# (1536x864 em vez de 1920x1080) e a captura sai cortada ou borrada.
[void][MaestroCaptura]::SetProcessDPIAware()

function Redimensionar($origem, $largura, $altura) {
    $destino = New-Object System.Drawing.Bitmap($largura, $altura, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($destino)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($origem, 0, 0, $largura, $altura)
    $g.Dispose()
    return $destino
}

try {
    $tela = $null
    if ($Monitor) {
        $tela = [System.Windows.Forms.Screen]::AllScreens | Where-Object { $_.DeviceName -eq $Monitor } | Select-Object -First 1
        if (-not $tela) { throw ('monitor-nao-encontrado: ' + $Monitor) }
    } else {
        $tela = [System.Windows.Forms.Screen]::PrimaryScreen
    }
    $area = $tela.Bounds

    $captura = New-Object System.Drawing.Bitmap($area.Width, $area.Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($captura)
    $g.CopyFromScreen($area.X, $area.Y, 0, 0, $area.Size)
    $g.Dispose()

    $alturaMiniatura = [int][Math]::Max(1, [Math]::Round($LarguraMiniatura * $area.Height / $area.Width))
    $miniatura = Redimensionar $captura $LarguraMiniatura $alturaMiniatura
    $amostra = Redimensionar $miniatura $LarguraAmostra $AlturaAmostra

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
    $parametros = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $parametros.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$QualidadeJpeg)
    $memoria = New-Object System.IO.MemoryStream
    $miniatura.Save($memoria, $codec, $parametros)
    $miniaturaB64 = [Convert]::ToBase64String($memoria.ToArray())
    $memoria.Dispose()

    # Tons de cinza (luminancia), linha a linha.
    $cinza = New-Object 'byte[]' ($LarguraAmostra * $AlturaAmostra)
    for ($y = 0; $y -lt $AlturaAmostra; $y++) {
        for ($x = 0; $x -lt $LarguraAmostra; $x++) {
            $p = $amostra.GetPixel($x, $y)
            $cinza[$y * $LarguraAmostra + $x] = [byte][Math]::Round(0.299 * $p.R + 0.587 * $p.G + 0.114 * $p.B)
        }
    }

    $dados = @{
        monitor   = $tela.DeviceName
        largura   = $area.Width
        altura    = $area.Height
        miniatura = $miniaturaB64
        amostra   = [Convert]::ToBase64String($cinza)
    }
    $captura.Dispose(); $miniatura.Dispose(); $amostra.Dispose()
    [Console]::Out.WriteLine((@{ ok = $true; dados = $dados } | ConvertTo-Json -Compress -Depth 5))
} catch {
    [Console]::Out.WriteLine((@{ ok = $false; erro = $_.Exception.Message } | ConvertTo-Json -Compress))
    exit 1
}
