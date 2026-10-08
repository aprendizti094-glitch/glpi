# Script de Otimizacao de Alta Performance para PHP e GLPI
param(
    [string]$PhpIniPath = ""
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   OTIMIZADOR DE ALTA PERFORMANCE PHP / GLPI (OPCACHE)    " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Localizar php.ini se nao fornecido
if (-not $PhpIniPath -or -not (Test-Path $PhpIniPath)) {
    try {
        $loadedIni = (php --ini | Select-String "Loaded Configuration File:\s*(.*)").Matches.Groups[1].Value.Trim()
        if ($loadedIni -and (Test-Path $loadedIni)) {
            $PhpIniPath = $loadedIni
        }
    } catch {
        # Fallback para XAMPP padrao
        if (Test-Path "C:\xampp\php\php.ini") {
            $PhpIniPath = "C:\xampp\php\php.ini"
        }
    }
}

if (-not $PhpIniPath -or -not (Test-Path $PhpIniPath)) {
    Write-Host "[ERRO] Nao foi possivel localizar o arquivo php.ini automaticamente." -ForegroundColor Red
    Write-Host "Por favor informe o caminho: .\otimizar_php.ps1 -PhpIniPath 'C:\caminho\php.ini'" -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK] Arquivo php.ini localizado: $PhpIniPath" -ForegroundColor Green

# 2. Fazer backup de seguranca
$backupPath = "$PhpIniPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $PhpIniPath $backupPath -Force
Write-Host "[OK] Backup criado em: $backupPath" -ForegroundColor Green

# 3. Ler conteudo atual
$content = Get-Content $PhpIniPath -Raw -Encoding UTF8

# 4. Assegurar que zend_extension esta no bloco opcache sem duplicar
$content = $content -replace '(?m)^zend_extension\s*=\s*opcache\r?$', ';zend_extension=opcache'

# 5. Ajustar diretrizes essenciais de memoria e tempo
$content = $content -replace 'memory_limit\s*=\s*\d+M?', 'memory_limit = 512M'
$content = $content -replace 'max_execution_time\s*=\s*\d+', 'max_execution_time = 300'
$content = $content -replace 'post_max_size\s*=\s*\d+M?', 'post_max_size = 64M'
$content = $content -replace 'upload_max_filesize\s*=\s*\d+M?', 'upload_max_filesize = 64M'
$content = $content -replace ';?max_input_vars\s*=\s*\d+', 'max_input_vars = 5000'

# 6. Realpath Cache
if ($content -match 'realpath_cache_size\s*=') {
    $content = $content -replace ';?realpath_cache_size\s*=.*', 'realpath_cache_size = 4096k'
} else {
    $content += "`r`nrealpath_cache_size = 4096k"
}
if ($content -match 'realpath_cache_ttl\s*=') {
    $content = $content -replace ';?realpath_cache_ttl\s*=.*', 'realpath_cache_ttl = 600'
} else {
    $content += "`r`nrealpath_cache_ttl = 600"
}

# 7. Bloco OPcache calibrado
$opcacheSettings = @"
[opcache]
zend_extension = opcache
opcache.enable = 1
opcache.enable_cli = 1
opcache.memory_consumption = 256
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
opcache.validate_timestamps = 1
opcache.revalidate_freq = 2
opcache.save_comments = 1
opcache.fast_shutdown = 1
opcache.jit = tracing
opcache.jit_buffer_size = 64M
"@

if ($content -match '\[opcache\]') {
    $content = $content -replace '(?s)\[opcache\].*?(?=\r?\n\[|\Z)', $opcacheSettings
} else {
    $content += "`r`n`r`n" + $opcacheSettings
}

# 8. Salvar php.ini
Set-Content -Path $PhpIniPath -Value $content -Encoding UTF8 -NoNewline
Write-Host "[SUCESSO] Otimizacoes de alta performance aplicadas ao php.ini!" -ForegroundColor Green

# 9. Testar se o PHP CLI ja reconhece o OPcache
Write-Host "`nTestando configuracoes ativas..." -ForegroundColor Yellow
$opcacheTest = php -r "echo extension_loaded('Zend OPcache') ? 'OPCACHE ATIVO E CARREGADO!' : 'EXTENSAO AINDA NAO CARREGADA';"
Write-Host "Status OPcache CLI: $opcacheTest" -ForegroundColor Cyan

# 10. Tentar reiniciar o Apache se estiver rodando via XAMPP
Write-Host "`nVerificando servico web..." -ForegroundColor Yellow
$httpd = Get-Process -Name "httpd" -ErrorAction SilentlyContinue
if ($httpd) {
    Write-Host "[INFO] Processo Apache (httpd) detectado em execucao." -ForegroundColor Yellow
    Write-Host "Reiniciando Apache para carregar novo php.ini..." -ForegroundColor Yellow
    try {
        Stop-Process -Name "httpd" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        if (Test-Path "C:\xampp\apache_start.bat") {
            Start-Process "C:\xampp\apache_start.bat" -WindowStyle Hidden
            Write-Host "[OK] Apache reiniciado com sucesso!" -ForegroundColor Green
        } elseif (Test-Path "C:\xampp\apache\bin\httpd.exe") {
            Start-Process "C:\xampp\apache\bin\httpd.exe" -WindowStyle Hidden
            Write-Host "[OK] Apache iniciado com sucesso!" -ForegroundColor Green
        }
    } catch {
        Write-Host "[AVISO] Reinicie o Apache pelo painel do XAMPP para que as alteracoes tenham efeito imediato no navegador." -ForegroundColor Magenta
    }
} else {
    Write-Host "[INFO] Se o Apache estiver rodando, reinicie-o no painel XAMPP para carregar o OPcache na web." -ForegroundColor Yellow
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "   OTIMIZACAO CONCLUIDA! O GLPI AGORA DEVE VOAR!          " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
