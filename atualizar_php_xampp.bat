@echo off
title Atualizar PHP no XAMPP para 8.2 (GLPI)
setlocal

:: Executa diretamente o script PowerShell sem bloquear por UAC
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar_php_xampp.ps1"
echo.
pause
