@echo off
chcp 65001 >nul
title GLPI - Túnel Ngrok de Alta Performance

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar_glpi_ngrok.ps1"

if %errorlevel% neq 0 (
    echo.
    echo Ocorreu um erro ao executar o inicializador.
    pause
)

