Set WshShell = CreateObject("WScript.Shell") 
WshShell.Run "node ""D:\server\apicheck\index.js""", 0
WshShell.Run "node ""D:\server\encryption\app.js""", 0
WshShell.Run "node ""D:\server\panel\app.js""", 0
Set WshShell = Nothing