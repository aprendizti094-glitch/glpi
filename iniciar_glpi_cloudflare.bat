@echo off
title GLPI - Redirecionando para Ngrok Guardian
color 0B
echo.
echo ========================================================
echo   AVISO: Cloudflare desativado. 
echo   Iniciando GLPI Guardian com NGROK (Obrigatorio)...
echo ========================================================
echo.
cd /d "%~dp0"
call "%~dp0iniciar_painel_guardian.bat"
