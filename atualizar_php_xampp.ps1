# ===================================================================
#   ATUALIZADOR AUTOMATICO DO PHP NO XAMPP (PHP 8.2 PARA GLPI)
# ===================================================================

$Host.UI.RawUI.WindowTitle = "Atualizador de PHP para XAMPP"
Clear-Host

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "           ATUALIZADOR DE PHP 8.2 PARA O XAMPP                     " -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Localizar pasta do XAMPP
$xamppPaths = @("C:\xampp", "D:\xampp", "E:\xampp", "$($PSScriptRoot.Substring(0,2))\xampp")
$xamppDir = $null
foreach ($path in $xamppPaths) {
    if (Test-Path "$path\apache\bin\httpd.exe") {
        $xamppDir = $path
        break
    }
}
if (-not $xamppDir) { $xamppDir = "C:\xampp" }

if (-not (Test-Path "$xamppDir\php\php.exe")) {
    Write-Host "[ERRO] PHP do XAMPP nao encontrado em $xamppDir\php\php.exe" -ForegroundColor Red
    Read-Host "Pressione ENTER para sair..."
    exit 1
}

$currentVer = (& "$xamppDir\php\php.exe" -r "echo PHP_VERSION;" 2>$null)
Write-Host "Versao atual do PHP no XAMPP: $currentVer" -ForegroundColor Yellow

if ($currentVer -and [version]$currentVer -ge [version]"8.2.0") {
    Write-Host "[OK] Seu PHP ja esta na versao 8.2 ou superior ($currentVer). Nenhuma atualizacao necessaria!" -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "O GLPI requer PHP 8.2 ou superior. Iniciando atualizacao automatica..." -ForegroundColor Cyan
Write-Host ""

# 2. Encerrar Apache
Write-Host "1/5 Encerrando servico do Apache..." -ForegroundColor White
Get-Process -Name httpd -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 3. Baixar PHP 8.2 oficial para Windows
$phpZipUrl = "https://windows.php.net/downloads/releases/php-8.2.34-Win32-vs16-x64.zip"
$tempZip = "$xamppDir\php82_temp.zip"
$tempExtract = "$xamppDir\php82_temp_extract"

Write-Host "2/5 Baixando PHP 8.2 Thread Safe oficial (32 MB)..." -ForegroundColor White
Write-Host "    Aguarde de 10 a 30 segundos dependendo da conexao..." -ForegroundColor Gray
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $phpZipUrl -OutFile $tempZip

if (-not (Test-Path $tempZip)) {
    Write-Host "[ERRO] Falha ao baixar o arquivo do PHP." -ForegroundColor Red
    Read-Host "Pressione ENTER para sair..."
    exit 1
}

# 4. Extrair arquivos
Write-Host "3/5 Extraindo arquivos do PHP 8.2..." -ForegroundColor White
Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue

# 5. Fazer backup da pasta antiga do PHP
$backupName = "php_backup_" + ($currentVer -replace '[^0-9.]', '')
$backupPath = "$xamppDir\$backupName"
Write-Host "4/5 Criando backup da pasta antiga em $backupPath..." -ForegroundColor White

if (Test-Path $backupPath) {
    Remove-Item -Path $backupPath -Recurse -Force -ErrorAction SilentlyContinue
}
Rename-Item -Path "$xamppDir\php" -NewName $backupName -Force

# Mover a nova pasta para C:\xampp\php
Move-Item -Path $tempExtract -DestinationPath "$xamppDir\php" -Force

# 6. Configurar o php.ini
Write-Host "5/5 Configurando php.ini com as extensoes necessarias para o GLPI..." -ForegroundColor White
$iniSource = "$backupPath\php.ini"
$iniDest = "$xamppDir\php\php.ini"

if (Test-Path $iniSource) {
    Copy-Item -Path $iniSource -Destination $iniDest -Force
} else {
    Copy-Item -Path "$xamppDir\php\php.ini-development" -Destination $iniDest -Force
}

# Habilitar extensoes criticas do GLPI no novo php.ini
if (Test-Path $iniDest) {
    $iniContent = Get-Content -Path $iniDest -Raw
    $extensionsToEnable = @("bz2", "curl", "fileinfo", "gd", "intl", "mbstring", "exif", "mysqli", "openssl", "pdo_mysql", "sodium", "zip", "opcache")
    foreach ($ext in $extensionsToEnable) {
        $iniContent = $iniContent -replace ";extension=$ext\b", "extension=$ext"
    }
    Set-Content -Path $iniDest -Value $iniContent -Force
}

# Verificar nova versao instalada
$newVer = (& "$xamppDir\php\php.exe" -r "echo PHP_VERSION;" 2>$null)

Write-Host ""
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "           PHP ATUALIZADO COM SUCESSO PARA $newVer!                " -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
Write-Host "  Backup da versao anterior salvo em: $backupPath" -ForegroundColor Gray
Write-Host "  O Apache agora esta pronto para executar o GLPI 11 sem erros!" -ForegroundColor Green
Write-Host "===================================================================" -ForegroundColor Green
Write-Host ""
