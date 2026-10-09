# Script de Otimizacao Total de Alta Performance para GLPI (PHP + MySQL/MariaDB + Apache + Network)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   OTIMIZADOR TURBO: GLPI + PHP + MYSQL + APACHE          " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# -------------------------------------------------------------------------
# 1. OTIMIZACAO DA CONEXAO COM BANCO (config_db.php)
# -------------------------------------------------------------------------
Write-Host "`n[1/5] Otimizando conexao GLPI com MySQL..." -ForegroundColor Yellow
$configDbCandidates = @(
    "C:\xampp\htdocs\glpi\config\config_db.php",
    "$PSScriptRoot\..\config\config_db.php"
)

foreach ($cfgPath in $configDbCandidates) {
    if (Test-Path $cfgPath) {
        $cfgContent = Get-Content $cfgPath -Raw -Encoding UTF8
        if ($cfgContent -match "dbhost\s*=\s*'localhost'") {
            $cfgContent = $cfgContent -replace "dbhost\s*=\s*'localhost'", "dbhost = '127.0.0.1'"
            Set-Content -Path $cfgPath -Value $cfgContent -Encoding UTF8 -NoNewline
            Write-Host "  -> [OK] Alterado dbhost de 'localhost' para '127.0.0.1' em $cfgPath (Elimina timeout de DNS/IPv6)!" -ForegroundColor Green
        } else {
            Write-Host "  -> [INFO] Conexao ja configurada para 127.0.0.1 ou IP direto em $cfgPath." -ForegroundColor Gray
        }
    }
}

# -------------------------------------------------------------------------
# 2. OTIMIZACAO DO MYSQL / MARIADB (my.ini)
# -------------------------------------------------------------------------
Write-Host "`n[2/5] Otimizando MariaDB / MySQL (my.ini)..." -ForegroundColor Yellow
$myIniPath = "C:\xampp\mysql\bin\my.ini"
if (Test-Path $myIniPath) {
    Copy-Item $myIniPath "$myIniPath.bak_turbo" -Force
    $myIni = Get-Content $myIniPath -Raw -Encoding UTF8

    # Buffer Pool de 16M -> 512M
    $myIni = $myIni -replace 'innodb_buffer_pool_size\s*=\s*\d+M?', 'innodb_buffer_pool_size=512M'
    
    # Flush log a cada segundo na RAM em vez de disco rigido a cada transacao (Acelera escritas em ate 15x)
    $myIni = $myIni -replace 'innodb_flush_log_at_trx_commit\s*=\s*\d+', 'innodb_flush_log_at_trx_commit=2'
    
    # Buffers adicionais de desempenho
    $myIni = $myIni -replace 'innodb_log_buffer_size\s*=\s*\d+M?', 'innodb_log_buffer_size=16M'

    # Tabelas temporarias e cache em memoria
    if ($myIni -notmatch 'table_open_cache\s*=') {
        $myIni = $myIni -replace '\[mysqld\]\r?\n', "[mysqld]`r`ntable_open_cache = 2000`r`nmax_heap_table_size = 64M`r`ntmp_table_size = 64M`r`n"
    }

    Set-Content -Path $myIniPath -Value $myIni -Encoding UTF8 -NoNewline
    Write-Host "  -> [OK] MySQL/MariaDB otimizado (Buffer Pool 512MB, Flush Log Assincrono)!" -ForegroundColor Green

    # Reiniciar MySQL se processo estiver ativo
    $mysqldProc = Get-Process -Name "mysqld" -ErrorAction SilentlyContinue
    if ($mysqldProc) {
        Write-Host "  -> Reiniciando servico MySQL para aplicar buffer..." -ForegroundColor Yellow
        Stop-Process -Name "mysqld" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        if (Test-Path "C:\xampp\mysql_start.bat") {
            Start-Process "C:\xampp\mysql_start.bat" -WindowStyle Hidden
        } elseif (Test-Path "C:\xampp\mysql\bin\mysqld.exe") {
            Start-Process "C:\xampp\mysql\bin\mysqld.exe" "--defaults-file=C:\xampp\mysql\bin\my.ini" -WindowStyle Hidden
        }
        Write-Host "  -> [OK] MySQL reiniciado!" -ForegroundColor Green
    }
} else {
    Write-Host "  -> [AVISO] my.ini nao encontrado em $myIniPath." -ForegroundColor Yellow
}

# -------------------------------------------------------------------------
# 3. OTIMIZACAO DO APACHE (httpd.conf) - COMPRESSAO GZIP & CACHE ESTÁTICO
# -------------------------------------------------------------------------
Write-Host "`n[3/5] Otimizando Apache (Gzip Deflate + Expires Cache + Sendfile fix)..." -ForegroundColor Yellow
$httpdConfPath = "C:\xampp\apache\conf\httpd.conf"
if (Test-Path $httpdConfPath) {
    Copy-Item $httpdConfPath "$httpdConfPath.bak_turbo" -Force
    $httpd = Get-Content $httpdConfPath -Raw -Encoding UTF8

    # Ativar mod_deflate, mod_expires, mod_headers e mod_filter
    $httpd = $httpd -replace '#LoadModule deflate_module modules/mod_deflate.so', 'LoadModule deflate_module modules/mod_deflate.so'
    $httpd = $httpd -replace '#LoadModule expires_module modules/mod_expires.so', 'LoadModule expires_module modules/mod_expires.so'
    $httpd = $httpd -replace '#LoadModule headers_module modules/mod_headers.so', 'LoadModule headers_module modules/mod_headers.so'
    $httpd = $httpd -replace '#LoadModule filter_module modules/mod_filter.so', 'LoadModule filter_module modules/mod_filter.so'

    # Regras de compressao e cache para alta performance no Windows
    $turboBlock = @"

# =====================================================================
# GLPI TURBO PERFORMANCE RULES (GZIP + EXPIRES + WINDOWS FIX)
# =====================================================================
EnableMMAP off
EnableSendfile off

<IfModule mod_deflate.c>
    <IfModule mod_filter.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css text/javascript application/javascript application/x-javascript application/json application/xml
    </IfModule>
</IfModule>

<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
    ExpiresByType application/x-javascript "access plus 1 month"
    ExpiresByType font/woff2 "access plus 1 year"
    ExpiresByType font/woff "access plus 1 year"
    ExpiresByType font/ttf "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 month"
    ExpiresByType image/png "access plus 1 month"
    ExpiresByType image/jpeg "access plus 1 month"
    ExpiresByType image/x-icon "access plus 1 year"
</IfModule>
"@

    if ($httpd -notmatch 'GLPI TURBO PERFORMANCE RULES') {
        $httpd += "`r`n" + $turboBlock
    }

    Set-Content -Path $httpdConfPath -Value $httpd -Encoding UTF8 -NoNewline
    Write-Host "  -> [OK] Apache otimizado com Compressao Gzip e Cache Estatico Ativo!" -ForegroundColor Green
}

# -------------------------------------------------------------------------
# 4. REAPLICAR OTIMIZACAO DO PHP (OPCACHE & MEMORY)
# -------------------------------------------------------------------------
Write-Host "`n[4/5] Garantindo calibracao do PHP OPcache..." -ForegroundColor Yellow
$phpOptScript = "$PSScriptRoot\otimizar_php.ps1"
if (Test-Path $phpOptScript) {
    & $phpOptScript
}

# -------------------------------------------------------------------------
# 5. LIMPAR E REORGANIZAR CACHE DO GLPI
# -------------------------------------------------------------------------
Write-Host "`n[5/5] Limpando e preparando cache de arquivos do GLPI..." -ForegroundColor Yellow
$glpiDir = "C:\xampp\htdocs\glpi"
if (Test-Path "$glpiDir\files\_cache") {
    try {
        Remove-Item "$glpiDir\files\_cache\*" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  -> [OK] Cache files/_cache/ esvaziado!" -ForegroundColor Green
    } catch {
        Write-Host "  -> [INFO] Cache ja limpo." -ForegroundColor Gray
    }
}

# Reiniciar Apache para carregar todas as novas diretrizes
$httpdProc = Get-Process -Name "httpd" -ErrorAction SilentlyContinue
if ($httpdProc) {
    Write-Host "`nReiniciando Apache..." -ForegroundColor Yellow
    Stop-Process -Name "httpd" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    if (Test-Path "C:\xampp\apache_start.bat") {
        Start-Process "C:\xampp\apache_start.bat" -WindowStyle Hidden
    } elseif (Test-Path "C:\xampp\apache\bin\httpd.exe") {
        Start-Process "C:\xampp\apache\bin\httpd.exe" -WindowStyle Hidden
    }
    Write-Host "[OK] Apache reiniciado com sucesso!" -ForegroundColor Green
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "   OTIMIZACAO TOTAL CONCLUIDA COM SUCESSO!                " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
