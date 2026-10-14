@echo off
title GLPI Guardian - Painel de Auditoria e Auto-Recuperacao
color 0B
cd /d "%~dp0monitor"

echo ========================================================
echo        INICIANDO GLPI GUARDIAN (AUDITORIA E PIDs)
echo ========================================================
echo.
echo [1/3] Finalizando processos orfaos antigos do Cloudflare...
taskkill /F /IM cloudflared.exe >nul 2>&1

echo [2/3] Verificando Node.js...
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERRO] Node.js nao encontrado no PATH do sistema.
    pause
    exit /b 1
)

echo [3/3] Iniciando servidor do Painel em http://localhost:5050 ...
echo.

start "" "http://localhost:5050"
node server.js

pause
