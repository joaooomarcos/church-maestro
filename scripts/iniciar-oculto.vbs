' Inicia o hub, o agente ou o atualizador sem janela de console.
' Uso: wscript.exe iniciar-oculto.vbs agent | hub | update
' hub/agent gravam a saida em data\<nome>.log; o atualizador tem log proprio.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

If WScript.Arguments.Count < 1 Then WScript.Quit 2
alvo = WScript.Arguments(0)
If alvo <> "agent" And alvo <> "hub" And alvo <> "update" Then WScript.Quit 2

raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
sh.CurrentDirectory = raiz
If Not fso.FolderExists(raiz & "\data") Then fso.CreateFolder raiz & "\data"

If alvo = "update" Then
  comando = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & raiz & "\scripts\atualizar.ps1"""
Else
  comando = "cmd /c node packages\" & alvo & "\dist\index.js >> data\" & alvo & ".log 2>&1"
End If

WScript.Quit sh.Run(comando, 0, True)
