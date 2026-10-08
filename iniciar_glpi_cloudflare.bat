@echo off
title Iniciar GLPI + Cloudflare Tunnel
setlocal

:: Procura o script PowerShell no mesmo diretorio, no XAMPP ou no Desktop
set "SCRIPT=%~dp0iniciar_glpi.ps1"
if not exist "%SCRIPT%" set "SCRIPT=C:\xampp\iniciar_glpi.ps1"
if not exist "%SCRIPT%" set "SCRIPT=c:\Users\Aprendiz Ti\Downloads\GLPI\glpi\iniciar_glpi.ps1"
if not exist "%SCRIPT%" set "SCRIPT=C:\Users\Aprendiz Ti\Desktop\iniciar_glpi.ps1"

if exist "%SCRIPT%" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
) else (
    echo.
    echo ===================================================
    echo   [ERRO] Nao foi possivel localizar iniciar_glpi.ps1
    echo ===================================================
    echo.
    pause
)
