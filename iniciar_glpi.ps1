# ===================================================
#  INICIALIZADOR DO GLPI + CLOUDFLARE TUNNEL
# ===================================================

$Host.UI.RawUI.WindowTitle = "GLPI + Cloudflare Tunnel"
Clear-Host

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "           INICIANDO GLPI + CLOUDFLARE             " -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
Write-Host ""

# 0. Integridade de pastas
$xamppDir = "C:\xampp"
if (-not (Test-Path "$xamppDir\htdocs")) {
    New-Item -ItemType Directory -Path "$xamppDir\htdocs" -Force | Out-Null
}
if (-not (Test-Path "$xamppDir\htdocs\glpi")) {
    cmd /c "mklink /J `"$xamppDir\htdocs\glpi`" `"$PSScriptRoot`"" | Out-Null
}

# 1. Verificando Apache e MySQL
Write-Host "1. Verificando servicos locais..." -ForegroundColor White

# Apache
$apache = Get-Process -Name httpd -ErrorAction SilentlyContinue
if (-not $apache) {
    Write-Host "   - Iniciando Apache do XAMPP..." -ForegroundColor Yellow
    Start-Process -FilePath "C:\xampp\apache\bin\httpd.exe" -WorkingDirectory "C:\xampp\apache" -WindowStyle Hidden
    Start-Sleep -Seconds 1
} else {
    Write-Host "   - Apache ja esta em execucao." -ForegroundColor Green
}

# MySQL
$mysql = Get-Process -Name mysqld -ErrorAction SilentlyContinue
if (-not $mysql) {
    Write-Host "   - Iniciando MySQL do XAMPP..." -ForegroundColor Yellow
    Start-Process -FilePath "C:\xampp\mysql\bin\mysqld.exe" -WorkingDirectory "C:\xampp\mysql" -ArgumentList '--defaults-file="C:\xampp\mysql\bin\my.ini"', '--standalone' -WindowStyle Hidden
    Start-Sleep -Seconds 1
} else {
    Write-Host "   - MySQL ja esta em execucao." -ForegroundColor Green
}

# 1. Detectar porta correta do Apache
$targetPort = 80
if (Test-Path "C:\xampp\apache\conf\httpd.conf") {
    $listenMatches = Get-Content "C:\xampp\apache\conf\httpd.conf" -ErrorAction SilentlyContinue | Select-String "^Listen\s+(\d+)"
    if ($listenMatches) {
        $targetPort = [int]$listenMatches[0].Matches.Groups[1].Value
    }
}
if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port $targetPort -WarningAction SilentlyContinue).TcpTestSucceeded) {
    foreach ($p in @(8080, 80, 8088)) {
        if ((Test-NetConnection -ComputerName 127.0.0.1 -Port $p -WarningAction SilentlyContinue).TcpTestSucceeded) {
            $targetPort = $p
            break
        }
    }
}

# 2. Encerrando instancias antigas do cloudflared
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 3. Iniciando Cloudflare Tunnel
Write-Host ""
Write-Host "2. Conectando a Cloudflare na porta $targetPort e gerando Link Publico..." -ForegroundColor White
Write-Host "   Aguarde alguns segundos..." -ForegroundColor Gray

$logFile = "C:\xampp\cloudflared_quick.log"
Remove-Item -Path $logFile -Force -ErrorAction SilentlyContinue

$cloudflaredExe = "C:\xampp\cloudflared.exe"
if (-not (Test-Path $cloudflaredExe)) {
    Write-Host "[ERRO] Executavel da Cloudflare nao encontrado em $cloudflaredExe" -ForegroundColor Red
    Read-Host "Pressione ENTER para sair..."
    exit 1
}

$tunnelProc = Start-Process -FilePath $cloudflaredExe -ArgumentList "tunnel", "--url", "http://127.0.0.1:$targetPort", "--logfile", $logFile -PassThru -WindowStyle Hidden

# Aguarda o link publico ser gerado no log (ate 30s)
$publicUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline -ForegroundColor Cyan
    
    if (Test-Path $logFile) {
        try {
            $logText = Get-Content -Path $logFile -Tail 50 -ErrorAction SilentlyContinue | Out-String
            $match = [regex]::Match($logText, 'https://[a-zA-Z0-9\-]+\.trycloudflare\.com')
            if ($match.Success) {
                $publicUrl = $match.Value
                break
            }
        } catch {}
    }
    
    if ($tunnelProc.HasExited) {
        break
    }
}
Write-Host ""

if ($publicUrl) {
    $glpiPublicUrl = "$publicUrl/glpi/"
    $glpiLocalUrl  = "http://localhost:$targetPort/glpi/"
    
    # Copia o link publico para a area de transferencia
    try {
        Set-Clipboard -Value $glpiPublicUrl
        $copied = $true
    } catch {
        $copied = $false
    }

    Write-Host ""
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "              GLPI ONLINE E ACESSIVEL PELA INTERNET!                 " -ForegroundColor Green
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  >> LINK PUBLICO (Envie para qualquer pessoa acessar):" -ForegroundColor Yellow
    Write-Host "     $glpiPublicUrl" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host ""
    Write-Host "  >> LINK LOCAL (Acesso deste computador):" -ForegroundColor Cyan
    Write-Host "     $glpiLocalUrl" -ForegroundColor Gray
    Write-Host ""
    if ($copied) {
        Write-Host "  [OK] Link publico copiado para a area de transferencia (Ctrl+V)!" -ForegroundColor Green
    }
    Write-Host "  [OK] Abrindo o Link Publico no seu navegador agora..." -ForegroundColor Green
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "  ATENCAO: Mantenha esta janela aberta para manter o GLPI online!" -ForegroundColor Yellow
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host ""

    # Pequena pausa para garantir conexao edge do Cloudflare ativa
    Start-Sleep -Seconds 2

    # Abre o link publico automaticamente no navegador padrao
    Start-Process $glpiPublicUrl

    try {
        Write-Host "Pressione qualquer tecla nesta janela para encerrar o tunnel quando terminar..." -ForegroundColor Gray
        if ([Environment]::UserInteractive) {
            $null = [Console]::ReadKey($true)
        } else {
            $tunnelProc.WaitForExit()
        }
    } catch {
        $tunnelProc.WaitForExit()
    }
    
    Write-Host "`nEncerrando Cloudflare Tunnel..." -ForegroundColor Yellow
    Stop-Process -Id $tunnelProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Tunnel encerrado com sucesso." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[AVISO] Nao foi possivel obter o link publico em tempo habil." -ForegroundColor Red
    Write-Host "Abrindo link local: http://localhost/glpi/" -ForegroundColor Yellow
    Start-Process "http://localhost/glpi/"
    
    Write-Host "`nPressione ENTER para sair..." -ForegroundColor Gray
    Read-Host
}
