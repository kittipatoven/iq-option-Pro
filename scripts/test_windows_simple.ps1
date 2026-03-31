# ===========================================
# Windows Network Test for IQ Option Bot
# (Non-Admin Version)
# ===========================================

param(
    [switch]$FullTest
)

# Colors using Write-Host
function Success($msg) { Write-Host "[✓] $msg" -ForegroundColor Green }
function Warning($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Error($msg) { Write-Host "[✗] $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "[i] $msg" -ForegroundColor Cyan }

# Header
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "   Windows Network Test for IQ Option   " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# ===========================================
# STEP 1: Check Basic Internet
# ===========================================
Info "STEP 1: Basic Internet Connectivity"

try {
    $ping = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet -ErrorAction Stop
    if ($ping) {
        Success "Internet connection: OK"
    } else {
        Error "Internet connection: FAILED"
    }
} catch {
    Error "Ping test failed: $($_.Exception.Message)"
}

# ===========================================
# STEP 2: Check DNS
# ===========================================
Write-Host ""
Info "STEP 2: DNS Resolution"

try {
    $dns = [System.Net.Dns]::GetHostAddresses("iqoption.com")
    if ($dns) {
        Success "DNS resolution: OK"
        Info "  IP addresses found: $($dns.Count)"
        $dns | ForEach-Object { Info "  - $($_.IPAddressToString)" }
    }
} catch {
    Error "DNS resolution failed: $($_.Exception.Message)"
}

# ===========================================
# STEP 3: Test HTTPS to IQ Option
# ===========================================
Write-Host ""
Info "STEP 3: HTTPS Connectivity Test"

$urls = @(
    @{Name="IQ Option"; Url="https://iqoption.com"},
    @{Name="Cloudflare"; Url="https://cloudflare.com"}
)

foreach ($test in $urls) {
    try {
        $request = [System.Net.WebRequest]::Create($test.Url)
        $request.Method = "HEAD"
        $request.Timeout = 10000
        $response = $request.GetResponse()
        $status = [int]$response.StatusCode
        $response.Close()
        
        if ($status -eq 200 -or $status -eq 301 -or $status -eq 302) {
            Success "$($test.Name): OK (HTTP $status)"
        } else {
            Warning "$($test.Name): HTTP $status"
        }
    } catch [System.Net.WebException] {
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -eq 200 -or $status -eq 301 -or $status -eq 302 -or $status -eq 403) {
            Success "$($test.Name): OK (HTTP $status)"
        } else {
            Error "$($test.Name): FAILED (HTTP $status)"
        }
    } catch {
        Error "$($test.Name): FAILED - $($_.Exception.Message)"
    }
}

# ===========================================
# STEP 4: Check WARP
# ===========================================
Write-Host ""
Info "STEP 4: Cloudflare WARP Status"

$warpPaths = @(
    "${env:ProgramFiles}\Cloudflare\Cloudflare WARP\warp-cli.exe",
    "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe",
    "${env:LOCALAPPDATA}\Programs\Cloudflare\Cloudflare WARP\warp-cli.exe"
)

$warpFound = $false
foreach ($path in $warpPaths) {
    if (Test-Path $path) {
        $warpFound = $true
        Success "WARP installed at: $path"
        break
    }
}

if (-not $warpFound) {
    Warning "WARP not found"
    Info "Download: https://1.1.1.1/ or Microsoft Store"
}

# ===========================================
# STEP 5: Network Info
# ===========================================
Write-Host ""
Info "STEP 5: Network Information"

# Get local IP
$localIP = @()
try {
    $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
    foreach ($adapter in $adapters | Select-Object -First 2) {
        $ips = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
        foreach ($ip in $ips | Where-Object { -not $_.IPAddress.StartsWith("127.") }) {
            $localIP += $ip.IPAddress
            Info "Adapter: $($adapter.Name) - IP: $($ip.IPAddress)"
        }
    }
} catch {
    Warning "Could not get network adapter info"
}

# Check public IP
Write-Host ""
Info "Checking public IP..."
try {
    $publicIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -TimeoutSec 10 -UseBasicParsing).Content
    Success "Public IP: $publicIP"
} catch {
    Warning "Could not determine public IP"
}

# ===========================================
# STEP 6: Port Test
# ===========================================
Write-Host ""
Info "STEP 6: Port Connectivity"

try {
    $client = New-Object System.Net.Sockets.TcpClient
    $result = $client.BeginConnect("iqoption.com", 443, $null, $null)
    $success = $result.AsyncWaitHandle.WaitOne(5000, $false)
    
    if ($success -and $client.Connected) {
        Success "HTTPS port 443: OPEN"
        $client.Close()
    } else {
        Error "HTTPS port 443: CLOSED/BLOCKED"
    }
} catch {
    Error "HTTPS port 443: ERROR - $($_.Exception.Message)"
}

# ===========================================
# SUMMARY
# ===========================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "              SUMMARY                   " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Quick test
$iqOK = $false
try {
    $req = [System.Net.WebRequest]::Create("https://iqoption.com")
    $req.Method = "HEAD"
    $req.Timeout = 5000
    $resp = $req.GetResponse()
    $sc = [int]$resp.StatusCode
    $resp.Close()
    $iqOK = ($sc -eq 200 -or $sc -eq 301 -or $sc -eq 302 -or $sc -eq 403)
} catch [System.Net.WebException] {
    $sc = [int]$_.Exception.Response.StatusCode
    $iqOK = ($sc -eq 200 -or $sc -eq 301 -or $sc -eq 302 -or $sc -eq 403)
} catch {}

if ($iqOK) {
    Write-Host "✓ Your PC can connect to IQ Option!" -ForegroundColor Green
    Write-Host "  Bot should work from this machine" -ForegroundColor Green
} else {
    Write-Host "✗ Connection issues detected" -ForegroundColor Red
    Write-Host "  Recommendations:" -ForegroundColor Yellow
    Write-Host "    1. Check firewall/antivirus settings" -ForegroundColor White
    Write-Host "    2. Try Cloudflare WARP VPN" -ForegroundColor White
    Write-Host "    3. Check if ISP blocks trading sites" -ForegroundColor White
}

Write-Host ""
Info "Test completed."

# Keep window open
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
