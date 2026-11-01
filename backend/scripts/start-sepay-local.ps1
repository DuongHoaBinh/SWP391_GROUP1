$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $backendRoot '.local\sepay'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$envFile = Join-Path $backendRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    throw 'Configure backend/.env using the SePay variables in .env.example first.'
}

$cloudflared = Join-Path $runtimeDir 'cloudflared.exe'
$expectedHash = '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343'
if (-not (Test-Path -LiteralPath $cloudflared)) {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/download/2026.10.7/cloudflared-windows-amd64.exe' -OutFile $cloudflared
}
if ((Get-FileHash -LiteralPath $cloudflared -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) {
    throw 'cloudflared checksum mismatch. Do not run this binary.'
}

$healthUrl = 'http://127.0.0.1:5002/api/payments/sepay/webhook'
$ready = $false
try { $ready = (Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2).service -eq 'ht-sepay-webhook' } catch {}
if (-not $ready) {
    $node = (Get-Command node.exe).Source
    $receiver = Start-Process -FilePath $node -ArgumentList @('"' + (Join-Path $PSScriptRoot 'sepay-webhook.cjs') + '"') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'receiver.log') -RedirectStandardError (Join-Path $runtimeDir 'receiver-error.log') -PassThru
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $ready = (Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2).service -eq 'ht-sepay-webhook' } catch {}
        if ($ready) { break }
        if ($receiver.HasExited) { throw 'Webhook receiver exited. Inspect backend/.local/sepay/receiver-error.log.' }
    }
    if (-not $ready) { throw 'Webhook receiver did not start.' }
}

$stateFile = Join-Path $runtimeDir 'runtime.json'
if (Test-Path -LiteralPath $stateFile) {
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $existingTunnel = Get-Process -Id $state.tunnelPid -ErrorAction SilentlyContinue
    if ($existingTunnel -and $existingTunnel.ProcessName -eq 'cloudflared') {
        Write-Output $state.webhookUrl
        exit 0
    }
}

$tunnelLog = Join-Path $runtimeDir 'tunnel.log'
$tunnel = Start-Process -FilePath $cloudflared -ArgumentList @('tunnel', '--url', 'http://127.0.0.1:5002', '--protocol', 'http2', '--no-autoupdate') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'tunnel-output.log') -RedirectStandardError $tunnelLog -PassThru
for ($attempt = 0; $attempt -lt 45; $attempt++) {
    Start-Sleep -Seconds 1
    if (Test-Path -LiteralPath $tunnelLog) {
        $match = [regex]::Match((Get-Content -LiteralPath $tunnelLog -Raw), 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) {
            $url = $match.Value + '/api/payments/sepay/webhook'
            @{ tunnelPid = $tunnel.Id; webhookUrl = $url; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $stateFile
            Write-Output $url
            exit 0
        }
    }
    if ($tunnel.HasExited) { throw 'Tunnel exited. Inspect backend/.local/sepay/tunnel.log.' }
}
throw 'Tunnel URL not available yet. Inspect backend/.local/sepay/tunnel.log.'
