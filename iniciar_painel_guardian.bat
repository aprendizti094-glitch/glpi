@echo off
title GLPI Guardian - Painel de Auditoria e Auto-Recuperacao
color 0B
cd /d "%~dp0monitor"

echo ========================================================
echo        INICIANDO GLPI GUARDIAN (AUDITORIA E PIDs)
echo ========================================================
echo.
echo [1/2] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Node.js nao encontrado no PATH do sistema.
    pause
    exit /b 1
)

echo [2/2] Iniciando servidor do Painel em http://localhost:4040 ...
echo.

start "" "http://localhost:4040"
node server.js

pause
