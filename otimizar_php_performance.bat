@echo off
chcp 65001 >nul
title Otimizador de Alta Performance PHP - GLPI

echo ========================================================
echo    APLICANDO OTIMIZACAO DE ALTA PERFORMANCE PHP / GLPI
echo ========================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\otimizar_php.ps1"

echo.
echo ========================================================
echo Pressione qualquer tecla para finalizar...
pause >nul
