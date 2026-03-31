# ===========================================
# Windows Network Test for IQ Option Bot
# (Non-Admin Version)
# ===========================================

# Header
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "   Windows Network Test for IQ Option   " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Helper functions
function Write-Success($msg) { Write-Host "[✓] $msg" -ForegroundColor Green }
function Write-Warning($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Error($msg) { Write-Host "[✗] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "[i] $msg" -ForegroundColor Cyan }

# ===========================================
# STEP 1: Check Basic Internet
# ===========================================
Write-Info "STEP 1: Basic Internet Connectivity"

try {
    $ping = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet -ErrorAction Stop
    if ($ping) {
        Write-Success "Internet connection: OK"
    } else {
        Write-Error "Internet connection: FAILED"
    }
} catch {
    Write-Error "Ping test failed: $($_.Exception.Message)"
}

# ===========================================
# STEP 2: Check DNS
# ===========================================
Write-Host ""
Write-Info "STEP 2: DNS Resolution"

try {
    $dns = [System.Net.Dns]::GetHostAddresses("iqoption.com")
    if ($dns) {
        Write-Success "DNS resolution: OK"
        Write-Info "  IP addresses found: $($dns.Count)"
        $dns | ForEach-Object { Write-Info "  - $($_.IPAddressToString)" }
    }
} catch {
    Write-Error "DNS resolution failed: $($_.Exception.Message)"
}

# ===========================================
# STEP 3: Test HTTPS to IQ Option
# ===========================================
Write-Host ""
Write-Info "STEP 3: HTTPS Connectivity Test"

$testUrls = @(
    @("IQ Option", "https://iqoption.com"),
    @("Cloudflare", "https://cloudflare.com")
)

foreach ($test in $testUrls) {
    $name = $test[0]
    $url = $test[1]
    try {
        $request = [System.Net.WebRequest]::Create($url)
        $request.Method = "HEAD"
        $request.Timeout = 10000
        $response = $request.GetResponse()
        $status = [int]$response.StatusCode
        $response.Close()
        
        if ($status -eq 200 -or $status -eq 301 -or $status -eq 302) {
            Write-Success "$name`: OK (HTTP $status)"
        } else {
            Write-Warning "$name`: HTTP $status"
        }
    } catch [System.Net.WebException] {
        $status = [int]$_.Exception.Response.StatusCode
        if ($status -eq 200 -or $status -eq 301 -or $status -eq 302 -or $status -eq 403) {
            Write-Success "$name`: OK (HTTP $status)"
        } else {
            Write-Error "$name`: FAILED (HTTP $status)"
        }
    } catch {
        Write-Error "$name`: FAILED - $($_.Exception.Message)"
    }
}

# ===========================================
# STEP 4: Check WARP
# ===========================================
Write-Host ""
Write-Info "STEP 4: Cloudflare WARP Status"

$warpPaths = @(
    "${env:ProgramFiles}\Cloudflare\Cloudflare WARP\warp-cli.exe",
    "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe",
    "${env:LOCALAPPDATA}\Programs\Cloudflare\Cloudflare WARP\warp-cli.exe"
)

$warpFound = $false
foreach ($path in $warpPaths) {
    if (Test-Path $path) {
        $warpFound = $true
        Write-Success "WARP installed at: $path"
        break
    }
}

if (-not $warpFound) {
    Write-Warning "WARP not found"
    Write-Info "Download: https://1.1.1.1/ or Microsoft Store"
}

# ===========================================
# STEP 5: Network Info
# ===========================================
Write-Host ""
Write-Info "STEP 5: Network Information"

# Get local IP
try {
    $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' }
    foreach ($adapter in $adapters | Select-Object -First 2) {
        $ips = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
        foreach ($ip in $ips | Where-Object { -not $_.IPAddress.StartsWith("127.") }) {
            Write-Info "Adapter: $($adapter.Name) - IP: $($ip.IPAddress)"
        }
    }
} catch {
    Write-Warning "Could not get network adapter info"
}

# Check public IP
Write-Host ""
Write-Info "Checking public IP..."
try {
    $publicIP = (Invoke-WebRequest -Uri "https://api.ipify.org" -TimeoutSec 10 -UseBasicParsing).Content
    Write-Success "Public IP: $publicIP"
} catch {
    Write-Warning "Could not determine public IP"
}

# ===========================================
# STEP 6: Port Test
# ===========================================
Write-Host ""
Write-Info "STEP 6: Port Connectivity"

try {
    $client = New-Object System.Net.Sockets.TcpClient
    $result = $client.BeginConnect("iqoption.com", 443, $null, $null)
    $success = $result.AsyncWaitHandle.WaitOne(5000, $false)
    
    if ($success -and $client.Connected) {
        Write-Success "HTTPS port 443: OPEN"
        $client.Close()
    } else {
        Write-Error "HTTPS port 443: CLOSED/BLOCKED"
    }
} catch {
    Write-Error "HTTPS port 443: ERROR - $($_.Exception.Message)"
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
} catch {
    $iqOK = $false
}

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
Write-Info "Test completed."

# Keep window open
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
