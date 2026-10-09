@echo off
title GLPI - Tunel Ngrok - Alta Performance
chcp 65001 >nul
color 0B

echo ===================================================================
echo             INICIANDO GLPI COM TUNEL NGROK - ALTA PERFORMANCE
echo ===================================================================
echo.

:: 1. Localizar pasta do XAMPP e aplicar auto-reparo de diretorios
set "XAMPP_DIR="
if exist "C:\xampp\apache\bin\httpd.exe" set "XAMPP_DIR=C:\xampp"
if not defined XAMPP_DIR if exist "D:\xampp\apache\bin\httpd.exe" set "XAMPP_DIR=D:\xampp"
if not defined XAMPP_DIR if exist "E:\xampp\apache\bin\httpd.exe" set "XAMPP_DIR=E:\xampp"
if not defined XAMPP_DIR if exist "%~d0\xampp\apache\bin\httpd.exe" set "XAMPP_DIR=%~d0\xampp"
if not defined XAMPP_DIR set "XAMPP_DIR=C:\xampp"

echo [1/4] Verificando integridade das pastas do Apache e XAMPP...
:: Correcao essencial: Criar htdocs se nao existir para evitar Syntax error AH00526
if not exist "%XAMPP_DIR%\htdocs" (
    echo   - Criando pasta ausente: %XAMPP_DIR%\htdocs
    mkdir "%XAMPP_DIR%\htdocs" 2>nul
)

:: Conectar esta pasta ao XAMPP via Junction caso esteja clonado fora do htdocs
if not exist "%XAMPP_DIR%\htdocs\glpi" (
    echo   - Conectando repositorio ao Apache em %XAMPP_DIR%\htdocs\glpi...
    mklink /J "%XAMPP_DIR%\htdocs\glpi" "%~dp0" >nul 2>nul
)

:: 2. Verificar e iniciar Apache e MySQL
echo.
echo [2/4] Verificando servicos locais - Apache e MySQL...
tasklist /fi "imagename eq mysqld.exe" 2>nul | find /i "mysqld.exe" >nul
if errorlevel 1 (
    echo   - MySQL nao detectado. Tentando iniciar...
    if exist "%XAMPP_DIR%\mysql\bin\mysqld.exe" (
        start "" /B "%XAMPP_DIR%\mysql\bin\mysqld.exe" --defaults-file="%XAMPP_DIR%\mysql\bin\my.ini" --standalone
    ) else if exist "%XAMPP_DIR%\mysql_start.bat" (
        start "" /min "%XAMPP_DIR%\mysql_start.bat"
    )
) else (
    echo   - MySQL ja esta em execucao.
)

tasklist /fi "imagename eq httpd.exe" 2>nul | find /i "httpd.exe" >nul
if errorlevel 1 (
    echo   - Apache nao detectado. Tentando iniciar...
    if exist "%XAMPP_DIR%\apache\bin\httpd.exe" (
        start "" /B "%XAMPP_DIR%\apache\bin\httpd.exe" -d "%XAMPP_DIR%\apache"
    ) else if exist "%XAMPP_DIR%\apache_start.bat" (
        start "" /min "%XAMPP_DIR%\apache_start.bat"
    )
) else (
    echo   - Apache ja esta em execucao.
)

:: 3. Localizar ou baixar o executavel do Ngrok
echo.
echo [3/4] Verificando executavel do Ngrok...
set "NGROK_BIN="

if exist "%~dp0ngrok.exe" (
    set "NGROK_BIN=%~dp0ngrok.exe"
    goto :VERIFICAR_TOKEN
)

where ngrok >nul 2>nul
if %errorlevel% equ 0 (
    set "NGROK_BIN=ngrok"
    goto :VERIFICAR_TOKEN
)

if exist "C:\ngrok\ngrok.exe" (
    set "NGROK_BIN=C:\ngrok\ngrok.exe"
    goto :VERIFICAR_TOKEN
)

if exist "%LOCALAPPDATA%\Programs\ngrok\ngrok.exe" (
    set "NGROK_BIN=%LOCALAPPDATA%\Programs\ngrok\ngrok.exe"
    goto :VERIFICAR_TOKEN
)

if exist "%APPDATA%\npm\node_modules\ngrok\bin\ngrok.exe" (
    set "NGROK_BIN=%APPDATA%\npm\node_modules\ngrok\bin\ngrok.exe"
    goto :VERIFICAR_TOKEN
)

:: Se nao encontrou, faz download automatico oficial
echo   - Ngrok nao encontrado. Baixando Ngrok oficial para Windows...
powershell -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile '%~dp0ngrok.zip'; Expand-Archive -Path '%~dp0ngrok.zip' -DestinationPath '%~dp0' -Force; Remove-Item '%~dp0ngrok.zip' -Force"

if exist "%~dp0ngrok.exe" (
    set "NGROK_BIN=%~dp0ngrok.exe"
    echo   [OK] Ngrok baixado com sucesso em %~dp0ngrok.exe!
    goto :VERIFICAR_TOKEN
)

echo.
echo [ERRO] Nao foi possivel baixar o Ngrok automaticamente.
echo Baixe manualmente em https://ngrok.com/download e cole o ngrok.exe nesta pasta.
echo.
pause
exit /b 1

:VERIFICAR_TOKEN
echo.
echo [4/4] Verificando autenticacao do Ngrok...

:: Testar se ha token configurado
set "TOKEN_CONFIGURED=0"
if exist "%LOCALAPPDATA%\ngrok\ngrok.yml" (
    findstr /i "authtoken" "%LOCALAPPDATA%\ngrok\ngrok.yml" >nul && set "TOKEN_CONFIGURED=1"
)
if exist "%USERPROFILE%\.ngrok2\ngrok.yml" (
    findstr /i "authtoken" "%USERPROFILE%\.ngrok2\ngrok.yml" >nul && set "TOKEN_CONFIGURED=1"
)

if "%TOKEN_CONFIGURED%"=="1" goto :TOKEN_CONFIGURADO

echo ===================================================================
echo  CONFIGURACAO NECESSARIA - APENAS NA PRIMEIRA VEZ
echo  O Ngrok precisa de um Authtoken gratuito para gerar o link publico.
echo.
echo  1. Acesse: https://dashboard.ngrok.com/get-started/your-authtoken
echo  2. Copie seu token e cole abaixo.
echo ===================================================================
echo.
set /p "USER_TOKEN=Cole o seu Authtoken aqui ou aperte ENTER se ja configurou: "
if not "%USER_TOKEN%"=="" (
    call "%NGROK_BIN%" config add-authtoken %USER_TOKEN%
)

:TOKEN_CONFIGURADO
echo.
echo ===================================================================
echo               INICIANDO TUNEL NGROK PARA O GLPI
echo ===================================================================
echo.
echo   COMO ACESSAR O GLPI:
echo   1. Copie o link que aparecer na linha Forwarding abaixo
echo      Exemplo: https://xxxx-xx-xx.ngrok-free.app
echo   2. Acesse no navegador adicionando /glpi/ no final:
echo      https://xxxx-xx-xx.ngrok-free.app/glpi/
echo.
echo   DICA: Para encerrar o tunel, pressione CTRL + C nesta janela.
echo ===================================================================
echo.

:: Verifica se o Apache está escutando antes de abrir o túnel
netstat -ano | findstr /r ":80 " >nul
if errorlevel 1 (
    echo.
    echo [ALERTA] O Apache ainda nao esta escutando na porta 80!
    echo Certifique-se de que o Apache esta verde (Start) no XAMPP Control Panel.
    echo.
)

:: Executa o ngrok com IPv4 explicito para evitar erro de dial tcp [::1]:80
call "%NGROK_BIN%" http 127.0.0.1:80

:: Caso o ngrok feche ou ocorra erro, a janela nao fecha sozinha
echo.
echo ===================================================================
echo  [AVISO] O processo do Ngrok foi finalizado.
echo  Codigo de saida: %errorlevel%
echo.
echo  Se a tela fechou logo apos abrir, as causas mais comuns sao:
echo  1. Authtoken nao cadastrado: pegue em https://dashboard.ngrok.com
echo     e configure com: ngrok config add-authtoken SEU_TOKEN
echo  2. Apache nao esta ligado na porta 80: abra o XAMPP Control Panel
echo     e clique no botao Start do Apache.
echo ===================================================================
echo.
pause
