@echo off
title Atualizar PHP no XAMPP para 8.2 (GLPI)
setlocal

:: Solicita privilegios de administrador se necessario para mover arquivos em C:\xampp
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] Solicitando permissao de Administrador para atualizar a pasta do XAMPP...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar_php_xampp.ps1"
echo.
pause
