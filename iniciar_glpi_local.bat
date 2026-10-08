@echo off
title GLPI - Inicializador Local (Alta Performance)
chcp 65001 >nul
color 0B

echo ===================================================
echo            INICIANDO GLPI LOCALMENTE
echo ===================================================
echo.

:: 1. Verificar e iniciar Apache do XAMPP
echo [1/3] Verificando Apache...
tasklist /FI "IMAGENAME eq httpd.exe" 2>NUL | find /I /N "httpd.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo   - Apache ja esta em execucao.
) else (
    echo   - Iniciando Apache...
    if exist "C:\xampp\apache\bin\httpd.exe" (
        start "" /B "C:\xampp\apache\bin\httpd.exe" -d "C:\xampp\apache"
    ) else (
        echo   [AVISO] Apache nao encontrado em C:\xampp\apache\bin\httpd.exe
    )
)

:: 2. Verificar e iniciar MySQL do XAMPP
echo.
echo [2/3] Verificando MySQL...
tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I /N "mysqld.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo   - MySQL ja esta em execucao.
) else (
    echo   - Iniciando MySQL...
    if exist "C:\xampp\mysql\bin\mysqld.exe" (
        start "" /B "C:\xampp\mysql\bin\mysqld.exe" --defaults-file="C:\xampp\mysql\bin\my.ini" --standalone
    ) else (
        echo   [AVISO] MySQL nao encontrado em C:\xampp\mysql\bin\mysqld.exe
    )
)

:: 3. Obter IP da maquina
set "LOCAL_IP="
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike '127*' } | Select-Object -First 1).IPAddress"`) do set "LOCAL_IP=%%i"

if "%LOCAL_IP%"=="" set "LOCAL_IP=IP_DO_SERVIDOR"

timeout /t 1 /nobreak >nul

echo.
echo =====================================================================
echo                    GLPI PRONTO PARA USO!
echo =====================================================================
echo.
echo   >> ACESSO LOCAL (Nesta maquina):
echo      http://localhost/glpi/
echo.
echo   >> ACESSO EXTERNO / REDE (Outros computadores):
echo      http://%LOCAL_IP%/glpi/
echo.
echo =====================================================================
echo.

:: 4. Abrir automaticamente no navegador padrao
echo [3/3] Abrindo GLPI no navegador...
start http://localhost/glpi/

echo.
echo Pressione qualquer tecla para sair desta janela...
pause >nul
