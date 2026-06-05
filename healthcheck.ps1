# healthcheck.ps1 — Cek kesehatan PLTS Dashboard (backend + endpoint)
# Lokal     : ./healthcheck.ps1
# Production: ./healthcheck.ps1 -ApiUrl https://komekko-plts-dashboard-api.hf.space -Frontend https://<url-vercel>
param(
    [string]$ApiUrl   = "http://localhost:5000",
    [string]$Frontend = "http://localhost:3000",
    [int]$TimeoutSec  = 90    # cukup panjang utk cold start Hugging Face Space
)

$ErrorActionPreference = "SilentlyContinue"
$pass = 0; $fail = 0

function Test-Endpoint {
    param([string]$Name, [string]$Url, [bool]$ExpectJson = $false)
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $res = Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing
        $sw.Stop()
        $ms = $sw.ElapsedMilliseconds
        if ($res.StatusCode -eq 200) {
            # Deteksi HF Space "sleeping/building" yang balas HTML, bukan JSON
            if ($ExpectJson -and $res.Content -notmatch '^\s*[\{\[]') {
                Write-Host ("  [WARN] {0,-26} 200 tapi BUKAN JSON (HF tidur/cold start?) ({1} ms)" -f $Name, $ms) -ForegroundColor Yellow
                $script:fail++
                return $null
            }
            Write-Host ("  [OK]   {0,-26} {1} ({2} ms)" -f $Name, $res.StatusCode, $ms) -ForegroundColor Green
            $script:pass++
            return $res.Content
        } else {
            Write-Host ("  [WARN] {0,-26} HTTP {1}" -f $Name, $res.StatusCode) -ForegroundColor Yellow
            $script:fail++
        }
    } catch {
        $sw.Stop()
        $code = $_.Exception.Response.StatusCode.value__
        if ($code) {
            Write-Host ("  [FAIL] {0,-26} HTTP {1}" -f $Name, $code) -ForegroundColor Red
        } else {
            Write-Host ("  [FAIL] {0,-26} tidak bisa konek (backend mati?)" -f $Name) -ForegroundColor Red
        }
        $script:fail++
    }
    return $null
}

Write-Host ""
Write-Host "=== PLTS Dashboard Health Check ===" -ForegroundColor Cyan
Write-Host ("Backend : {0}" -f $ApiUrl)
Write-Host ("Frontend: {0}" -f $Frontend)
Write-Host ""

# --- Prioritas 1+2: endpoint backend ---
Write-Host "Backend endpoints:" -ForegroundColor Cyan
$null   = Test-Endpoint "GET /api/status"          "$ApiUrl/api/status"          $true
$daily  = Test-Endpoint "GET /api/forecast/daily"  "$ApiUrl/api/forecast/daily"  $true
$weekly = Test-Endpoint "GET /api/forecast/weekly" "$ApiUrl/api/forecast/weekly" $true
$null   = Test-Endpoint "GET /api/history"         "$ApiUrl/api/history"         $true

# --- Prioritas 3: model vs physics fallback ---
Write-Host ""
Write-Host "Model status:" -ForegroundColor Cyan
$fallback = $false
foreach ($body in @($daily, $weekly)) {
    if ($body -and $body -match '"method"\s*:\s*"physics_fallback"') { $fallback = $true }
}
if ($fallback) {
    Write-Host "  [WARN] Model LSTM TIDAK aktif -> jalan di physics_fallback" -ForegroundColor Yellow
    Write-Host "         Cek file results_hourly_multivariate_v2.pkl & log Flask." -ForegroundColor Yellow
} elseif ($daily -or $weekly) {
    Write-Host "  [OK]   Model LSTM aktif (bukan physics_fallback)" -ForegroundColor Green
} else {
    Write-Host "  [SKIP] Tidak ada response forecast untuk dicek." -ForegroundColor DarkGray
}

# --- Frontend reachable? ---
Write-Host ""
Write-Host "Frontend:" -ForegroundColor Cyan
$null = Test-Endpoint "GET / (Next.js)" $Frontend

# --- Ringkasan ---
Write-Host ""
Write-Host "=== Ringkasan ===" -ForegroundColor Cyan
Write-Host ("  Lolos: {0}   Gagal: {1}" -f $pass, $fail)
if ($fail -gt 0) {
    Write-Host "  -> Ada masalah. Buka MAINTENANCE.md, mulai dari Prioritas 1." -ForegroundColor Yellow
    exit 1
} else {
    Write-Host "  -> Semua sehat." -ForegroundColor Green
    exit 0
}
