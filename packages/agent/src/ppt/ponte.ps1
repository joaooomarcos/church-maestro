# Ponte COM com o PowerPoint.
#
# Roda como um processo persistente: le uma linha JSON de stdin, executa e
# escreve uma linha JSON em stdout. Abrir um powershell.exe por comando custaria
# uns 300ms, o que se nota ao passar slide durante o louvor.
#
# ATENCAO: este arquivo e mantido em ASCII puro de proposito. O PowerShell 5.1
# le .ps1 sem BOM como ANSI, e acentos aqui viram caracteres quebrados. Todo
# texto voltado ao usuario fica do lado TypeScript.

$ErrorActionPreference = 'Stop'
$app = $null

function Get-PowerPoint {
    # GetActiveObject anexa a uma instancia ja aberta e falha se nao houver
    # nenhuma. E o comportamento que queremos: o agente nunca deve abrir o
    # PowerPoint sozinho so porque o painel pediu o status.
    if ($null -ne $script:app) {
        try {
            $null = $script:app.Version
            return $script:app
        } catch {
            $script:app = $null
        }
    }
    $script:app = [Runtime.InteropServices.Marshal]::GetActiveObject('PowerPoint.Application')
    return $script:app
}

function Get-Status {
    $ppt = Get-PowerPoint

    $emApresentacao = $false
    $slide = $null
    $total = $null
    $arquivo = $null

    if ($ppt.Presentations.Count -gt 0) {
        $apresentacao = $ppt.ActivePresentation
        $arquivo = $apresentacao.Name
        $total = $apresentacao.Slides.Count
    }

    if ($ppt.SlideShowWindows.Count -gt 0) {
        $emApresentacao = $true
        $slide = $ppt.SlideShowWindows.Item(1).View.CurrentShowPosition
    }

    return @{
        emApresentacao = $emApresentacao
        slide          = $slide
        totalSlides    = $total
        arquivo        = $arquivo
    }
}

function Get-View {
    $ppt = Get-PowerPoint
    if ($ppt.SlideShowWindows.Count -eq 0) {
        throw [System.Exception]::new('fora-de-exibicao')
    }
    return $ppt.SlideShowWindows.Item(1).View
}

function Invoke-Comando($comando) {
    switch ($comando.acao) {
        'status' {
            return Get-Status
        }
        'proximo' {
            (Get-View).Next()
            return Get-Status
        }
        'anterior' {
            (Get-View).Previous()
            return Get-Status
        }
        'irPara' {
            (Get-View).GotoSlide([int]$comando.slide)
            return Get-Status
        }
        'iniciar' {
            $ppt = Get-PowerPoint
            if ($ppt.Presentations.Count -eq 0) {
                throw [System.Exception]::new('sem-apresentacao')
            }
            if ($ppt.SlideShowWindows.Count -eq 0) {
                $null = $ppt.ActivePresentation.SlideShowSettings.Run()
            }
            return Get-Status
        }
        'encerrar' {
            $ppt = Get-PowerPoint
            if ($ppt.SlideShowWindows.Count -gt 0) {
                $ppt.SlideShowWindows.Item(1).View.Exit()
            }
            return Get-Status
        }
        default {
            throw [System.Exception]::new('acao-desconhecida')
        }
    }
}

# Classifica a falha num codigo estavel; o lado TypeScript traduz para o texto
# que aparece no celular de quem esta operando.
function Get-CodigoErro($mensagem) {
    if ($mensagem -match 'fora-de-exibicao') { return 'fora-de-exibicao' }
    if ($mensagem -match 'sem-apresentacao') { return 'sem-apresentacao' }
    if ($mensagem -match 'acao-desconhecida') { return 'acao-desconhecida' }
    if ($mensagem -match '0x800401E3' -or $mensagem -match 'Operation unavailable' -or $mensagem -match 'MK_E_UNAVAILABLE') {
        return 'sem-powerpoint'
    }
    return 'erro-com'
}

[Console]::Out.WriteLine('{"pronto":true}')
[Console]::Out.Flush()

while ($true) {
    $linha = [Console]::In.ReadLine()
    if ($null -eq $linha) { break }
    if ($linha.Trim().Length -eq 0) { continue }

    $id = 0
    try {
        $comando = $linha | ConvertFrom-Json
        $id = $comando.id
        $dados = Invoke-Comando $comando
        $resposta = @{ id = $id; ok = $true; dados = $dados }
    } catch {
        $mensagem = $_.Exception.Message
        $resposta = @{
            id     = $id
            ok     = $false
            codigo = (Get-CodigoErro $mensagem)
            erro   = $mensagem
        }
    }

    [Console]::Out.WriteLine(($resposta | ConvertTo-Json -Compress -Depth 5))
    [Console]::Out.Flush()
}
