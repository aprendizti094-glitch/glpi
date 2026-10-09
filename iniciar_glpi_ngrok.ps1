# ===================================================================
#           INICIALIZADOR DO GLPI + TUNEL NGROK (ALTA PERFORMANCE)
# ===================================================================

$Host.UI.RawUI.WindowTitle = "GLPI - Tunel Ngrok (Alta Performance)"
Clear-Host

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "             INICIANDO GLPI COM TUNEL NGROK (AUTO)                 " -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Localizar pasta do XAMPP e aplicar auto-reparo de diretorios
$xamppPaths = @("C:\xampp", "D:\xampp", "E:\xampp", "$($PSScriptRoot.Substring(0,2))\xampp")
$xamppDir = $null
foreach ($path in $xamppPaths) {
    if (Test-Path "$path\apache\bin\httpd.exe") {
        $xamppDir = $path
        break
    }
}
if (-not $xamppDir) { $xamppDir = "C:\xampp" }

Write-Host "1. Verificando integridade das pastas locais..." -ForegroundColor White

# Cria pasta htdocs se nao existir (evita erro AH00526 do Apache)
if (-not (Test-Path "$xamppDir\htdocs")) {
    Write-Host "   - Criando pasta ausente: $xamppDir\htdocs" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path "$xamppDir\htdocs" -Force | Out-Null
}

# Conecta esta pasta ao Apache via Junction caso esteja clonado fora do htdocs
if (-not (Test-Path "$xamppDir\htdocs\glpi")) {
    Write-Host "   - Vinculando repositorio ao Apache em $xamppDir\htdocs\glpi..." -ForegroundColor Yellow
    cmd /c "mklink /J `"$xamppDir\htdocs\glpi`" `"$PSScriptRoot`"" | Out-Null
}

# Detecta a porta configurada no Apache (padrao 80 ou 8080)
$apachePort = 80
if (Test-Path "$xamppDir\apache\conf\httpd.conf") {
    $listenMatches = Get-Content "$xamppDir\apache\conf\httpd.conf" -ErrorAction SilentlyContinue | Select-String "^Listen\s+(\d+)"
    if ($listenMatches) {
        $apachePort = [int]$listenMatches[0].Matches.Groups[1].Value
    }
}

# 2. Iniciar Apache e MySQL em segundo plano
Write-Host ""
Write-Host "2. Inicializando servicos do servidor (Apache na porta $apachePort e MySQL)..." -ForegroundColor White

# MySQL
$mysql = Get-Process -Name mysqld -ErrorAction SilentlyContinue
if (-not $mysql) {
    Write-Host "   - Iniciando MySQL do XAMPP..." -ForegroundColor Yellow
    if (Test-Path "$xamppDir\mysql\bin\mysqld.exe") {
        Start-Process -FilePath "$xamppDir\mysql\bin\mysqld.exe" -WorkingDirectory "$xamppDir\mysql" -ArgumentList "--defaults-file=`"$xamppDir\mysql\bin\my.ini`"", "--standalone" -WindowStyle Hidden
    }
    Start-Sleep -Seconds 1
} else {
    Write-Host "   - MySQL ja esta ativo." -ForegroundColor Green
}

# Apache
$apacheRunning = (Test-NetConnection -ComputerName 127.0.0.1 -Port $apachePort -WarningAction SilentlyContinue).TcpTestSucceeded
if (-not $apacheRunning) {
    Write-Host "   - Iniciando Apache do XAMPP na porta $apachePort..." -ForegroundColor Yellow
    
    # Tenta como servico primeiro se existir
    Start-Service -Name "Apache2.4" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    $apacheRunning = (Test-NetConnection -ComputerName 127.0.0.1 -Port $apachePort -WarningAction SilentlyContinue).TcpTestSucceeded

    # Se ainda nao estiver rodando, sobe pelo executavel
    if (-not $apacheRunning -and (Test-Path "$xamppDir\apache\bin\httpd.exe")) {
        Start-Process -FilePath "$xamppDir\apache\bin\httpd.exe" -WorkingDirectory "$xamppDir\apache" -WindowStyle Hidden
        for ($i = 0; $i -lt 5; $i++) {
            Start-Sleep -Seconds 1
            $apacheRunning = (Test-NetConnection -ComputerName 127.0.0.1 -Port $apachePort -WarningAction SilentlyContinue).TcpTestSucceeded
            if ($apacheRunning) { break }
        }
    }
}

if ($apacheRunning) {
    Write-Host "   - Apache ativo e respondendo na porta $apachePort." -ForegroundColor Green
} else {
    Write-Host "   [AVISO] Apache ainda nao respondeu na porta $apachePort." -ForegroundColor Yellow
    Write-Host "   Verificando diagnostico do Apache..." -ForegroundColor Gray
    try {
        $diag = & "$xamppDir\apache\bin\httpd.exe" -t 2>&1 | Out-String
        if ($diag -and $diag.Trim() -ne "") {
            Write-Host "   Diagnostico do Apache: $diag" -ForegroundColor Red
        }
    } catch {}
}

# 3. Localizar ou baixar o executavel do Ngrok
Write-Host ""
Write-Host "3. Verificando executavel do Ngrok..." -ForegroundColor White

$ngrokExe = "$PSScriptRoot\ngrok.exe"
if (-not (Test-Path $ngrokExe)) {
    $found = Get-Command ngrok.exe -ErrorAction SilentlyContinue
    if ($found) { $ngrokExe = $found.Source }
}
if (-not (Test-Path $ngrokExe)) {
    if (Test-Path "C:\ngrok\ngrok.exe") { $ngrokExe = "C:\ngrok\ngrok.exe" }
    elseif (Test-Path "$env:LOCALAPPDATA\Programs\ngrok\ngrok.exe") { $ngrokExe = "$env:LOCALAPPDATA\Programs\ngrok\ngrok.exe" }
}

if (-not (Test-Path $ngrokExe)) {
    Write-Host "   - Ngrok nao encontrado. Baixando oficial automaticamente..." -ForegroundColor Yellow
    $zipPath = "$PSScriptRoot\ngrok.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip" -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $PSScriptRoot -Force
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    $ngrokExe = "$PSScriptRoot\ngrok.exe"
    Write-Host "   [OK] Ngrok baixado com sucesso!" -ForegroundColor Green
}

# 4. Verificar Authtoken do Ngrok
$hasToken = $false
$ngrokConfig1 = "$env:LOCALAPPDATA\ngrok\ngrok.yml"
$ngrokConfig2 = "$env:USERPROFILE\.ngrok2\ngrok.yml"
if (Test-Path $ngrokConfig1) {
    if (Get-Content $ngrokConfig1 -ErrorAction SilentlyContinue | Select-String "authtoken:") { $hasToken = $true }
}
if (Test-Path $ngrokConfig2) {
    if (Get-Content $ngrokConfig2 -ErrorAction SilentlyContinue | Select-String "authtoken:") { $hasToken = $true }
}

if (-not $hasToken) {
    Write-Host ""
    Write-Host "===================================================================" -ForegroundColor Magenta
    Write-Host " [PRIMEIRO ACESSO] O NGROK REQUER SEU AUTHTOKEN GRATUITO          " -ForegroundColor Magenta
    Write-Host " 1. Obtenha em: https://dashboard.ngrok.com/get-started/your-authtoken" -ForegroundColor Yellow
    Write-Host "===================================================================" -ForegroundColor Magenta
    $userToken = Read-Host " Cole seu token aqui (ou ENTER se ja configurou)"
    if ($userToken -and $userToken.Trim() -ne "") {
        & $ngrokExe config add-authtoken $userToken.Trim()
    }
}

# 5. Encerrar instancias antigas do Ngrok
Get-Process -Name ngrok -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 6. Iniciar Ngrok em segundo plano apontando para a porta do Apache
Write-Host ""
Write-Host "4. Conectando ao Ngrok e gerando o Link Publico..." -ForegroundColor White
Write-Host "   Aguarde alguns segundos..." -ForegroundColor Gray

$ngrokProc = Start-Process -FilePath $ngrokExe -ArgumentList "http", "127.0.0.1:$apachePort" -PassThru -WindowStyle Hidden

# 7. Obter Link Publico da API local do Ngrok (porta 4040)
$publicUrl = $null
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline -ForegroundColor Cyan

    try {
        $res = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2 -ErrorAction Stop
        if ($res.tunnels -and $res.tunnels.Count -gt 0) {
            # Prioriza url https
            $httpsTunnel = $res.tunnels | Where-Object { $_.public_url -like "https://*" } | Select-Object -First 1
            if ($httpsTunnel) {
                $publicUrl = $httpsTunnel.public_url
            } else {
                $publicUrl = $res.tunnels[0].public_url
            }
            break
        }
    } catch {}

    if ($ngrokProc.HasExited) {
        break
    }
}
Write-Host ""

if ($publicUrl) {
    $glpiPublicUrl = "$publicUrl/glpi/"
    $glpiLocalUrl  = "http://localhost:$apachePort/glpi/"

    # Copia link para a area de transferencia
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
    Write-Host "  >> LINK PUBLICO NGROK (Envie para qualquer pessoa acessar):" -ForegroundColor Yellow
    Write-Host "     $glpiPublicUrl" -ForegroundColor White -BackgroundColor DarkGreen
    Write-Host ""
    Write-Host "  >> LINK LOCAL (Acesso deste computador):" -ForegroundColor Cyan
    Write-Host "     $glpiLocalUrl" -ForegroundColor Gray
    Write-Host ""
    if ($copied) {
        Write-Host "  [OK] Link publico copiado para a area de transferencia (Ctrl + V)!" -ForegroundColor Green
    }
    Write-Host "  [OK] Abrindo o Link Publico no seu navegador agora..." -ForegroundColor Green
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host "  ATENCAO: Mantenha esta janela aberta para manter o GLPI online!" -ForegroundColor Yellow
    Write-Host "=====================================================================" -ForegroundColor Green
    Write-Host ""

    Start-Sleep -Seconds 1
    # Abre automaticamente no navegador padrao
    Start-Process $glpiPublicUrl

    try {
        Write-Host "Pressione qualquer tecla nesta janela para encerrar o tunel quando terminar..." -ForegroundColor Gray
        if ([Environment]::UserInteractive) {
            $null = [Console]::ReadKey($true)
        } else {
            $ngrokProc.WaitForExit()
        }
    } catch {
        $ngrokProc.WaitForExit()
    }

    Write-Host "`nEncerrando tunel Ngrok..." -ForegroundColor Yellow
    Stop-Process -Id $ngrokProc.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Tunel encerrado com sucesso." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ERRO] Nao foi possivel obter o link publico do Ngrok." -ForegroundColor Red
    Write-Host "Verifique se o seu Authtoken e valido ou se o Apache esta respondendo." -ForegroundColor Yellow
    Write-Host "Tentando abrir localmente: http://localhost:$apachePort/glpi/" -ForegroundColor Gray
    Start-Process "http://localhost:$apachePort/glpi/"
    Write-Host "`nPressione ENTER para sair..." -ForegroundColor Gray
    Read-Host
}
