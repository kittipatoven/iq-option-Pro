#Requires -RunAsAdministrator
# ===========================================
# Windows Network Test for IQ Option Bot
# Test connectivity and WARP status locally
# ===========================================

param(
    [switch]$InstallWarp,
    [switch]$TestOnly
)

# Colors
$Red = "`e[31m"
$Green = "`e[32m"
$Yellow = "`e[33m"
$Blue = "`e[34m"
$Reset = "`e[0m"

# Logging
$LogFile = "$env:USERPROFILE\Documents\iq_network_test.log"
function Log($msg) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $msg" | Tee-Object -FilePath $LogFile -Append
}

function Success($msg) { Write-Host "${Green}[✓]${Reset} $msg" }
function Warning($msg) { Write-Host "${Yellow}[!]${Reset} $msg" }
function Error($msg) { Write-Host "${Red}[✗]${Reset} $msg" }
function Info($msg) { Write-Host "${Blue}[i]${Reset} $msg" }

# Header
Write-Host "`n========================================" -ForegroundColor Blue
Write-Host "   Windows Network Test for IQ Option   " -ForegroundColor Blue
Write-Host "========================================`n" -ForegroundColor Blue

Log "=== Network Test Started ==="

# ===========================================
# STEP 1: Check Basic Internet
# ===========================================
Write-Host "STEP 1: Basic Internet Connectivity" -ForegroundColor Cyan

$googleTest = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet
if ($googleTest) {
    Success "Internet connection: OK"
    Log "Internet: OK"
} else {
    Error "No internet connection"
    Log "Internet: FAILED"
}

# ===========================================
# STEP 2: Check DNS
# ===========================================
Write-Host "`nSTEP 2: DNS Resolution" -ForegroundColor Cyan

try {
    $dns = Resolve-DnsName -Name "iqoption.com" -ErrorAction Stop | Select-Object -First 1
    Success "DNS resolution: OK ($($dns.IPAddress))"
    Log "DNS: OK - $($dns.IPAddress)"
} catch {
    Error "DNS resolution failed"
    Log "DNS: FAILED - $($_.Exception.Message)"
}

# ===========================================
# STEP 3: Test HTTPS to IQ Option
# ===========================================
Write-Host "`nSTEP 3: HTTPS Connectivity Test" -ForegroundColor Cyan

$urls = @(
    @{Name="IQ Option"; Url="https://iqoption.com"},
    @{Name="Auth API"; Url="https://auth.iqoption.com"},
    @{Name="WS Server"; Url="https://ws.iqoption.com"},
    @{Name="Cloudflare"; Url="https://cloudflare.com"}
)

foreach ($test in $urls) {
    try {
        $response = Invoke-WebRequest -Uri $test.Url -Method HEAD -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        $status = $response.StatusCode
        if ($status -eq 200 -or $status -eq 301 -or $status -eq 302) {
            Success "$($test.Name): OK (HTTP $status)"
            Log "$($test.Name): OK"
        } else {
            Warning "$($test.Name): HTTP $status"
            Log "$($test.Name): HTTP $status"
        }
    } catch {
        Error "$($test.Name): FAILED - $($_.Exception.Message)"
        Log "$($test.Name): FAILED"
    }
}

# ===========================================
# STEP 4: Check WARP (Windows)
# ===========================================
Write-Host "`nSTEP 4: Cloudflare WARP Status" -ForegroundColor Cyan

$warpInstalled = $false
$warpPaths = @(
    "${env:ProgramFiles}\Cloudflare\Cloudflare WARP\warp-cli.exe",
    "${env:LOCALAPPDATA}\Programs\Cloudflare\Cloudflare WARP\warp-cli.exe",
    "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe"
)

foreach ($path in $warpPaths) {
    if (Test-Path $path) {
        $warpInstalled = $true
        Info "WARP found at: $path"
        Log "WARP found: $path"
        break
    }
}

if (-not $warpInstalled) {
    Warning "WARP not installed"
    Info "Install from: https://1.1.1.1/ or Microsoft Store"
    Log "WARP: Not installed"
    
    if ($InstallWarp) {
        Info "Attempting to install WARP via winget..."
        try {
            winget install Cloudflare.Warp --accept-source-agreements --accept-package-agreements
            Success "WARP installation initiated"
            Log "WARP: Install started"
            Warning "Please restart this script after WARP installation completes"
        } catch {
            Error "Failed to install WARP. Install manually."
            Log "WARP: Install failed"
        }
    } else {
        Info "Run with -InstallWarp flag to auto-install"
    }
} else {
    # Check WARP service
    $warpService = Get-Service -Name "CloudflareWARP" -ErrorAction SilentlyContinue
    if ($warpService) {
        if ($warpService.Status -eq 'Running') {
            Success "WARP service: Running"
            Log "WARP Service: Running"
        } else {
            Warning "WARP service: $($warpService.Status)"
            Info "Start WARP manually or run: net start CloudflareWARP"
            Log "WARP Service: $($warpService.Status)"
        }
    }
    
    # Check WARP CLI if available
    $warpCli = Get-Command warp-cli -ErrorAction SilentlyContinue
    if ($warpCli) {
        try {
            $warpStatus = & warp-cli status 2>&1
            Info "WARP Status: $warpStatus"
            Log "WARP Status: $warpStatus"
        } catch {
            Warning "Could not get WARP CLI status"
        }
    }
}

# ===========================================
# STEP 5: Check Proxy Settings
# ===========================================
Write-Host "`nSTEP 5: Proxy Configuration" -ForegroundColor Cyan

$proxy = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyEnable -ErrorAction SilentlyContinue
if ($proxy.ProxyEnable -eq 1) {
    $proxyServer = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -Name ProxyServer -ErrorAction SilentlyContinue
    Warning "System proxy ENABLED: $($proxyServer.ProxyServer)"
    Log "Proxy: Enabled - $($proxyServer.ProxyServer)"
} else {
    Info "System proxy: Disabled"
    Log "Proxy: Disabled"
}

# ===========================================
# STEP 6: Network Configuration
# ===========================================
Write-Host "`nSTEP 6: Network Configuration" -ForegroundColor Cyan

$adapter = Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1
if ($adapter) {
    Info "Active adapter: $($adapter.Name)"
    
    $ip = Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 | Select-Object -First 1
    Info "Local IP: $($ip.IPAddress)"
    Log "Local IP: $($ip.IPAddress)"
    
    $dnsServers = Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 | Select-Object -ExpandProperty ServerAddresses
    Info "DNS Servers: $($dnsServers -join ', ')"
    Log "DNS: $($dnsServers -join ', ')"
}

# Public IP
Info "Checking public IP..."
try {
    $publicIP = Invoke-RestMethod -Uri "https://api.ipify.org" -TimeoutSec 10
    Info "Public IP: $publicIP"
    Log "Public IP: $publicIP"
} catch {
    Warning "Could not determine public IP"
}

# ===========================================
# STEP 7: Test with WARP (if enabled)
# ===========================================
if ($warpInstalled) {
    Write-Host "`nSTEP 7: Testing with WARP" -ForegroundColor Cyan
    Warning "Ensure WARP is CONNECTED, then run this test again"
}

# ===========================================
# STEP 8: Port Tests
# ===========================================
Write-Host "`nSTEP 8: Port Connectivity" -ForegroundColor Cyan

$ports = @(
    @{Host="iqoption.com"; Port=443; Name="HTTPS"},
    @{Host="iqoption.com"; Port=80; Name="HTTP"}
)

foreach ($portTest in $ports) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $result = $client.BeginConnect($portTest.Host, $portTest.Port, $null, $null)
        $success = $result.AsyncWaitHandle.WaitOne(5000, $false)
        if ($success -and $client.Connected) {
            Success "$($portTest.Name) port ($($portTest.Port)): OPEN"
            Log "$($portTest.Name): OPEN"
            $client.Close()
        } else {
            Error "$($portTest.Name) port ($($portTest.Port)): CLOSED/BLOCKED"
            Log "$($portTest.Name): CLOSED"
        }
    } catch {
        Error "$($portTest.Name) port: ERROR"
        Log "$($portTest.Name): ERROR"
    }
}

# ===========================================
# SUMMARY
# ===========================================
Write-Host "`n========================================" -ForegroundColor Blue
Write-Host "              SUMMARY                   " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue

# Quick checks
$iqTest = $false
try {
    $r = Invoke-WebRequest -Uri "https://iqoption.com" -Method HEAD -TimeoutSec 5 -UseBasicParsing
    $iqTest = $r.StatusCode -eq 200 -or $r.StatusCode -eq 301
} catch {}

if ($iqTest) {
    Write-Host "`n${Green}✓ Your Windows PC can connect to IQ Option${Reset}" -NoNewline
    Write-Host "`n  Bot should work from this machine`n"
} else {
    Write-Host "`n${Red}✗ Connection issues detected${Reset}" -NoNewline
    Write-Host "`n  Recommendations:" -NoNewline
    Write-Host "`n  1. Check firewall settings"
    Write-Host "  2. Try using WARP VPN"
    Write-Host "  3. Check if ISP blocks trading sites"
    Write-Host "  4. Test from different network`n"
}

Info "Log saved to: $LogFile"
Info "Run with -InstallWarp to auto-install WARP"

Log "=== Test Complete ==="
Write-Host "`nPress any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
