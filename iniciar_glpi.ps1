# ===================================================================
#  GLPI - EXECUÇÃO OBRIGATÓRIA VIA NGROK (CLOUDFLARE DESATIVADO)
# ===================================================================

$Host.UI.RawUI.WindowTitle = "GLPI - Túnel Ngrok (Obrigatório)"
Clear-Host

Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host "         INICIANDO GLPI COM NGROK (CLOUDFLARE DESATIVADO)          " -ForegroundColor Cyan
Write-Host "===================================================================" -ForegroundColor Cyan
Write-Host ""

$scriptNgrok = "$PSScriptRoot\iniciar_glpi_ngrok.ps1"
if (-not (Test-Path $scriptNgrok)) {
    $scriptNgrok = "c:\Users\Aprendiz Ti\Downloads\GLPI\glpi\iniciar_glpi_ngrok.ps1"
}

if (Test-Path $scriptNgrok) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$scriptNgrok"
} else {
    Write-Host "[ERRO] Script iniciar_glpi_ngrok.ps1 nao encontrado em $PSScriptRoot" -ForegroundColor Red
    pause
}
