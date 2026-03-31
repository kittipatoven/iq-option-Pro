# Windows Network Test for IQ Option Bot - Simple Version
Write-Host "========================================" -ForegroundColor Blue
Write-Host "   Windows Network Test for IQ Option   " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue
Write-Host ""

# Test 1: Basic Internet
Write-Host "[i] Testing Internet Connection..." -ForegroundColor Cyan
try {
    $ping = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet
    if ($ping) {
        Write-Host "[OK] Internet: Connected" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Internet: Not connected" -ForegroundColor Red
    }
} catch {
    Write-Host "[FAIL] Internet test error" -ForegroundColor Red
}

# Test 2: DNS
Write-Host ""
Write-Host "[i] Testing DNS Resolution..." -ForegroundColor Cyan
try {
    $dns = [System.Net.Dns]::GetHostAddresses("iqoption.com")
    Write-Host "[OK] DNS: iqoption.com resolves to $($dns[0].IPAddressToString)" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] DNS: Cannot resolve iqoption.com" -ForegroundColor Red
}

# Test 3: HTTP Test
Write-Host ""
Write-Host "[i] Testing HTTPS Connection..." -ForegroundColor Cyan
try {
    $request = [System.Net.WebRequest]::Create("https://iqoption.com")
    $request.Method = "HEAD"
    $request.Timeout = 10000
    $response = $request.GetResponse()
    $status = [int]$response.StatusCode
    $response.Close()
    Write-Host "[OK] HTTPS: iqoption.com responded with HTTP $status" -ForegroundColor Green
} catch [System.Net.WebException] {
    $status = [int]$_.Exception.Response.StatusCode
    if ($status -eq 403 -or $status -eq 200 -or $status -eq 301 -or $status -eq 302) {
        Write-Host "[OK] HTTPS: iqoption.com responded with HTTP $status" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] HTTPS: HTTP $status" -ForegroundColor Red
    }
} catch {
    Write-Host "[FAIL] HTTPS: Connection failed - $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Port Test
Write-Host ""
Write-Host "[i] Testing Port 443..." -ForegroundColor Cyan
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $result = $client.BeginConnect("iqoption.com", 443, $null, $null)
    $success = $result.AsyncWaitHandle.WaitOne(5000, $false)
    if ($success -and $client.Connected) {
        Write-Host "[OK] Port 443: OPEN" -ForegroundColor Green
        $client.Close()
    } else {
        Write-Host "[FAIL] Port 443: CLOSED" -ForegroundColor Red
    }
} catch {
    Write-Host "[FAIL] Port 443: Error" -ForegroundColor Red
}

# Test 5: WARP Check
Write-Host ""
Write-Host "[i] Checking WARP..." -ForegroundColor Cyan
$warpInstalled = Test-Path "${env:ProgramFiles}\Cloudflare\Cloudflare WARP\warp-cli.exe"
if (-not $warpInstalled) {
    $warpInstalled = Test-Path "C:\Program Files\Cloudflare\Cloudflare WARP\warp-cli.exe"
}
if ($warpInstalled) {
    Write-Host "[OK] WARP: Installed" -ForegroundColor Green
} else {
    Write-Host "[!] WARP: Not installed" -ForegroundColor Yellow
}

# Test 6: Public IP
Write-Host ""
Write-Host "[i] Checking Public IP..." -ForegroundColor Cyan
try {
    $ip = (Invoke-WebRequest -Uri "https://api.ipify.org" -TimeoutSec 10 -UseBasicParsing).Content
    Write-Host "[OK] Public IP: $ip" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Could not get public IP" -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Blue
Write-Host "              SUMMARY                   " -ForegroundColor Blue
Write-Host "========================================" -ForegroundColor Blue

$iqOK = $false
try {
    $r = [System.Net.WebRequest]::Create("https://iqoption.com")
    $r.Method = "HEAD"
    $r.Timeout = 5000
    $resp = $r.GetResponse()
    $iqOK = ($resp.StatusCode -eq 200 -or $resp.StatusCode -eq 301 -or $resp.StatusCode -eq 302 -or $resp.StatusCode -eq 403)
    $resp.Close()
} catch [System.Net.WebException] {
    $sc = [int]$_.Exception.Response.StatusCode
    $iqOK = ($sc -eq 200 -or $sc -eq 301 -or $sc -eq 302 -or $sc -eq 403)
} catch {
    $iqOK = $false
}

Write-Host ""
if ($iqOK) {
    Write-Host "  ✓ YOUR PC CAN CONNECT TO IQ OPTION!" -ForegroundColor Green
    Write-Host "  The bot should work from this machine." -ForegroundColor Green
} else {
    Write-Host "  ✗ CONNECTION ISSUES DETECTED" -ForegroundColor Red
    Write-Host "  Recommendations:" -ForegroundColor Yellow
    Write-Host "    - Check firewall/antivirus settings" -ForegroundColor White
    Write-Host "    - Try Cloudflare WARP VPN" -ForegroundColor White
    Write-Host "    - Contact your ISP if trading sites are blocked" -ForegroundColor White
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
