# ===================================================================
# Script para habilitar extensoes do PHP (GD, INTL, LDAP, EXIF) no XAMPP
# ===================================================================

# Auto-elevar para Administrador se necessario para ter permissao de salvar em C:\xampp\php\php.ini
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[INFO] Solicitando permissao de Administrador para modificar o php.ini..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$iniPath = "C:\xampp\php\php.ini"
if (-not (Test-Path $iniPath)) {
    Write-Host "[ERRO] Arquivo php.ini nao encontrado em $iniPath" -ForegroundColor Red
    exit 1
}

# Remover atributo Somente Leitura se houver
Set-ItemProperty -Path $iniPath -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue

# 1. Backup de seguranca
$backup = "$iniPath.bak_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
Copy-Item $iniPath $backup -Force
Write-Host "[OK] Backup do php.ini criado em: $backup" -ForegroundColor Green

# 2. Ler arquivo
$content = Get-Content $iniPath -Raw -Encoding UTF8

# 3. Habilitar extensoes obrigatorias e recomendadas pelo GLPI
$exts = @("gd", "intl", "exif", "ldap")
foreach ($ext in $exts) {
    if ($content -match "(?m)^;\s*extension\s*=\s*$ext") {
        $content = $content -replace "(?m)^;\s*extension\s*=\s*$ext", "extension=$ext"
        Write-Host "   - Extensao habilitada: $ext" -ForegroundColor Green
    } elseif ($content -match "(?m)^extension\s*=\s*$ext") {
        Write-Host "   - Extensao ja estava ativa: $ext" -ForegroundColor Cyan
    } else {
        # Se nao estava listada, adiciona
        $content += "`r`nextension=$ext"
        Write-Host "   - Extensao adicionada: $ext" -ForegroundColor Green
    }
}

# 4. Ajustar seguranca de sessao recomendada
if ($content -match "session.cookie_httponly\s*=") {
    $content = $content -replace ";?session.cookie_httponly\s*=.*", "session.cookie_httponly = 1"
} else {
    $content += "`r`nsession.cookie_httponly = 1"
}
Write-Host "   - Diretiva session.cookie_httponly ativada." -ForegroundColor Green

# 5. Salvar php.ini
try {
    [System.IO.File]::WriteAllText($iniPath, $content, [System.Text.Encoding]::UTF8)
    Write-Host ""
    Write-Host "[SUCESSO] php.ini atualizado com sucesso!" -ForegroundColor Green
} catch {
    Write-Host ""
    Write-Host "[ERRO ao salvar]: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Yellow
Write-Host " IMPORTANTE: Para o PHP carregar as novas extensoes:" -ForegroundColor Yellow
Write-Host " No Painel de Controle do XAMPP, clique em 'Stop' e depois em 'Start' no Apache." -ForegroundColor White
Write-Host " (Ou feche e abra o Apache quando for oportuno)." -ForegroundColor Gray
Write-Host "=====================================================================" -ForegroundColor Yellow
