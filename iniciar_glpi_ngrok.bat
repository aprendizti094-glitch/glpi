@echo off
title Iniciar GLPI + Ngrok Tunnel
setlocal

:: Procura o script PowerShell no mesmo diretorio
set "SCRIPT=%~dp0iniciar_glpi_ngrok.ps1"

if exist "%SCRIPT%" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
) else (
    echo.
    echo ===================================================
    echo   [ERRO] Nao foi possivel localizar iniciar_glpi_ngrok.ps1
    echo ===================================================
    echo.
    pause
)
