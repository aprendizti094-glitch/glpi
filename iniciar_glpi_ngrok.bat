@echo off
chcp 65001 >nul
title GLPI - Túnel Ngrok de Alta Performance

echo ===================================================================
echo             INICIANDO GLPI COM TÚNEL NGROK (ALTA PERFORMANCE)
echo ===================================================================
echo.

:: 1. Verificar se Apache e MySQL estão rodando
tasklist /fi "imagename eq mysqld.exe" 2>nul | find /i "mysqld.exe" >nul
if errorlevel 1 (
    echo [AVISO] MySQL não detectado. Tentando iniciar pelo XAMPP...
    if exist "C:\xampp\mysql_start.bat" (
        start "" /min "C:\xampp\mysql_start.bat"
    )
)

tasklist /fi "imagename eq httpd.exe" 2>nul | find /i "httpd.exe" >nul
if errorlevel 1 (
    echo [AVISO] Apache não detectado. Tentando iniciar pelo XAMPP...
    if exist "C:\xampp\apache_start.bat" (
        start "" /min "C:\xampp\apache_start.bat"
    )
)

:: 2. Localizar o executável do Ngrok
set "NGROK_BIN="

where ngrok >nul 2>nul
if %errorlevel% equ 0 (
    set "NGROK_BIN=ngrok"
    goto :INICIAR
)

if exist "%APPDATA%\npm\node_modules\ngrok\bin\ngrok.exe" (
    set "NGROK_BIN=%APPDATA%\npm\node_modules\ngrok\bin\ngrok.exe"
    goto :INICIAR
)

if exist "%~dp0ngrok.exe" (
    set "NGROK_BIN=%~dp0ngrok.exe"
    goto :INICIAR
)

if exist "C:\ngrok\ngrok.exe" (
    set "NGROK_BIN=C:\ngrok\ngrok.exe"
    goto :INICIAR
)

if exist "%LOCALAPPDATA%\Programs\ngrok\ngrok.exe" (
    set "NGROK_BIN=%LOCALAPPDATA%\Programs\ngrok\ngrok.exe"
    goto :INICIAR
)

:: Se não encontrou, faz download automático oficial
echo [INFO] O Ngrok não foi encontrado no sistema.
echo Baixando Ngrok oficial para Windows automaticamente...
powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile '%~dp0ngrok.zip'; Expand-Archive -Path '%~dp0ngrok.zip' -DestinationPath '%~dp0' -Force; Remove-Item '%~dp0ngrok.zip' -Force"

if exist "%~dp0ngrok.exe" (
    set "NGROK_BIN=%~dp0ngrok.exe"
    echo [OK] Ngrok baixado com sucesso!
    goto :INICIAR
)

echo [ERRO] Não foi possível encontrar ou baixar o Ngrok.
echo Por favor baixe em https://ngrok.com/download ou instale com: winget install ngrok
pause
exit /b 1

:INICIAR
echo.
echo [OK] Servidor local e Ngrok prontos!
echo.
echo -------------------------------------------------------------------
echo  COMO ACESSAR:
echo  1. Copie a URL pública gerada abaixo (ex: https://xxxx.ngrok-free.app)
echo  2. Abra no navegador adicionando /glpi/ no final:
echo     Exemplo: https://xxxx.ngrok-free.app/glpi/
echo -------------------------------------------------------------------
echo.
echo Pressione Ctrl + C para encerrar o túnel quando desejar.
echo.

"%NGROK_BIN%" http 80 --host-header="localhost"
