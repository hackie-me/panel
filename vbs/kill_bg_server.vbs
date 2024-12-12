Set WshShell = CreateObject("WScript.Shell")
' Kill the Node.js process running in the background
WshShell.Run "taskkill /F /IM node.exe", 0
Set WshShell = Nothing
