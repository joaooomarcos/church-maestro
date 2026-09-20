' Inicia o hub ou o agente sem janela de console e grava a saida em data\<nome>.log.
' Uso: wscript.exe iniciar-oculto.vbs agent   (ou hub)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count < 1 Then WScript.Quit 2
alvo = WScript.Arguments(0)
If alvo <> "agent" And alvo <> "hub" Then WScript.Quit 2

raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = raiz
If Not fso.FolderExists(raiz & "\data") Then fso.CreateFolder raiz & "\data"

comando = "cmd /c node packages\" & alvo & "\dist\index.js >> data\" & alvo & ".log 2>&1"
WScript.Quit sh.Run(comando, 0, True)
