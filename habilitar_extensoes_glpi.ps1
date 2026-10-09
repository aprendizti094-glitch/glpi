# ===================================================================
# Script para habilitar extensoes do PHP (GD, INTL, LDAP, EXIF) no XAMPP
# ===================================================================

$iniPath = "C:\xampp\php\php.ini"
if (-not (Test-Path $iniPath)) {
    Write-Host "[ERRO] Arquivo php.ini nao encontrado em $iniPath" -ForegroundColor Red
    exit 1
}

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
Set-Content -Path $iniPath -Value $content -Encoding UTF8 -NoNewline
Write-Host ""
Write-Host "[SUCESSO] php.ini atualizado com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Yellow
Write-Host " IMPORTANTE: Para o PHP carregar as novas extensoes:" -ForegroundColor Yellow
Write-Host " No Painel de Controle do XAMPP, clique em 'Stop' e depois em 'Start' no Apache." -ForegroundColor White
Write-Host " (Ou feche e abra o Apache quando for oportuno)." -ForegroundColor Gray
Write-Host "=====================================================================" -ForegroundColor Yellow
