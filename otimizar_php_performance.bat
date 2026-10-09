@echo off
chcp 65001 >nul
title Otimizador de Alta Performance Turbo - GLPI & Servidor

echo ===================================================================
echo     APLICANDO OTIMIZACAO TURBO TOTAL: PHP + MYSQL + APACHE + GLPI
echo ===================================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\otimizar_servidor_completo.ps1"

echo.
echo ===================================================================
echo Otimizacao finalizada! Reinicie seu navegador ou use Ctrl + F5.
echo ===================================================================
pause
