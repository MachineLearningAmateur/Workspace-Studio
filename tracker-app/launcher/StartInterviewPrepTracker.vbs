Option Explicit

Dim appDirectory, npmPath, logPath, pageUrl, apiHealthUrl
appDirectory = "D:\Code Projects\CareerPrep\tracker-app"
npmPath = "C:\Program Files\nodejs\npm.cmd"
logPath = appDirectory & "\launcher\tracker-launcher.log"
pageUrl = "http://127.0.0.1:5173/"
apiHealthUrl = "http://127.0.0.1:3001/api/health"

On Error Resume Next

If Not IsUrlReady(apiHealthUrl) Or Not IsUrlReady(pageUrl) Then
  StartHiddenServer
End If

If WaitForUrl(pageUrl, 45) Then
  CreateObject("WScript.Shell").Run pageUrl, 1, False
Else
  MsgBox "The tracker page did not become ready at " & pageUrl & vbCrLf & "Check the launcher log at " & logPath, vbCritical, "Interview Prep Tracker Launcher"
End If

Private Sub StartHiddenServer()
  Dim shell, command
  Set shell = CreateObject("WScript.Shell")
  command = "cmd.exe /c cd /d """ & appDirectory & """ && """ & npmPath & """ run dev > """ & logPath & """ 2>&1"
  shell.Run command, 0, False
End Sub

Private Function WaitForUrl(url, timeoutSeconds)
  Dim deadline
  deadline = DateAdd("s", timeoutSeconds, Now)

  Do While Now < deadline
    If IsUrlReady(url) Then
      WaitForUrl = True
      Exit Function
    End If

    WScript.Sleep 500
  Loop

  WaitForUrl = False
End Function

Private Function IsUrlReady(url)
  Dim request, statusCode
  IsUrlReady = False

  Set request = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  request.setTimeouts 1000, 1000, 1000, 1000
  request.open "GET", url, False
  request.send

  If Err.Number <> 0 Then
    Err.Clear
    Exit Function
  End If

  statusCode = request.status
  IsUrlReady = statusCode >= 200 And statusCode < 400
End Function
