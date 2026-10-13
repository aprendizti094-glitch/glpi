<#
  Diagnostico GLPI via ngrok.
  Rode na maquina remota (com o ngrok ja ligado):
      powershell -ExecutionPolicy Bypass -File .\diagnostico_ngrok.ps1
  Depois mande o texto que aparecer (ou o arquivo diagnostico_ngrok.txt).
#>
$out = Join-Path $PSScriptRoot 'diagnostico_ngrok.txt'
Start-Transcript -Path $out -Force | Out-Null

function Section($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }

Section "Ambiente"
"Pasta do GLPI : $PSScriptRoot"
$phpExe = if (Test-Path 'C:\xampp\php\php.exe') { 'C:\xampp\php\php.exe' } else { 'php' }
"PHP           : " + ((& $phpExe -v 2>&1 | Select-Object -First 1) -join '')
$mpm = 'C:\xampp\apache\conf\extra\httpd-mpm.conf'
"ThreadStackSize aplicado: " + [bool]((Test-Path $mpm) -and ((Get-Content $mpm -Raw) -match 'ThreadStackSize\s+8388608'))
"Git commit    : " + ((& git -C $PSScriptRoot log -1 --oneline 2>&1) -join '')

Section "Tunel ngrok"
$public = $null
try {
    $res = Invoke-RestMethod -Uri 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 3
    $t = $res.tunnels | Where-Object { $_.public_url -like 'https://*' } | Select-Object -First 1
    if ($t) { $public = $t.public_url; "URL publica : $public"; "Aponta para : " + $t.config.addr }
} catch { "ngrok nao respondeu na porta 4040: $($_.Exception.Message)" }

if ($public) {
    Section "Pagina inicial e assets (via ngrok)"
    $h = @{ 'ngrok-skip-browser-warning' = '1' }
    $base = "$public/glpi/"
    try {
        $r = Invoke-WebRequest -Uri $base -Headers $h -UseBasicParsing -MaximumRedirection 5
        "GET $base -> $($r.StatusCode)  ($($r.Content.Length) bytes)  URL final: $($r.BaseResponse.ResponseUri.AbsoluteUri)"
        $links = [regex]::Matches($r.Content, '(?:href|src)="([^"#]+\.(?:css|js)[^"]*)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
        foreach ($l in $links) {
            $u = if ($l -match '^https?://') { $l } else { "$public$l" }
            try {
                $a = Invoke-WebRequest -Uri $u -Headers $h -UseBasicParsing
                "{0}  {1,-28} {2,8} bytes  {3}" -f $a.StatusCode, $a.Headers['Content-Type'], $a.Content.Length, $l
            } catch {
                $code = $_.Exception.Response.StatusCode.value__
                "{0}  FALHOU                                     {1}" -f $code, $l
            }
        }
        Section "Links absolutos http:// na pagina (mixed content)"
        [regex]::Matches($r.Content, 'http://[^"''\s<>]+') | ForEach-Object { $_.Value } | Select-Object -Unique
    } catch { "Erro ao abrir a pagina: $($_.Exception.Message)" }
}

Section "Apache: quedas do processo (status 3221225725 = stack overflow)"
$apLog = 'C:\xampp\apache\logs\error.log'
if (Test-Path $apLog) {
    $crash = Select-String -Path $apLog -Pattern 'AH00428|3221225725|3221225477|exited with status' | Select-Object -Last 10
    if ($crash) { $crash | ForEach-Object { $_.Line } } else { 'Nenhuma queda registrada.' }
    Section "Apache: ultimas linhas que NAO sao aviso de ssl/oci8"
    Get-Content $apLog | Where-Object { $_ -notmatch 'ssl:warn|oci8|already loaded|Unable to load dynamic' } | Select-Object -Last 15
} else { "$apLog nao encontrado" }

Section "Ultimos erros do PHP/GLPI"
foreach ($p in "$PSScriptRoot\files\_log\php-errors.log", "$PSScriptRoot\files\_log\php-errors.log") {
    if (Test-Path $p) { Get-Content $p -Tail 15; break }
}

Stop-Transcript | Out-Null
Write-Host ""
Write-Host "Relatorio salvo em: $out" -ForegroundColor Green
