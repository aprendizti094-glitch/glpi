@echo off
chcp 65001 >nul
title GLPI - Auto Discovery e Importacao
cls

echo ===================================================================
echo             GLPI - AUTO-DISCOVERY E IMPORTACAO DE ATIVOS
echo ===================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Python nao foi encontrado no PATH do Windows!
    echo Instale o Python ou execute atraves do ambiente do Python.
    pause
    exit /b 1
)

python "%~dp0scripts\popular_glpi.py" %*

echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
