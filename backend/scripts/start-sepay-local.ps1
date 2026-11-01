$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $backendRoot '.local\sepay'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$envFile = Join-Path $backendRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) {
    throw 'Configure backend/.env using the SePay variables in .env.example first.'
}

$node = (Get-Command node.exe).Source
# Capture only the necessary settings; never print secrets or pass tokens in CLI arguments.
$settingsJson = @'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const dotenv = require(path.join(root, 'node_modules/dotenv'));
const env = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
console.log(JSON.stringify({token: env.NGROK_AUTHTOKEN || '', domain: env.NGROK_DOMAIN || '', port: Number(env.SEPAY_WEBHOOK_PORT || 5002)}));
'@ | & $node - $backendRoot
if ($LASTEXITCODE -ne 0) { throw 'Cannot read backend/.env. Install backend dependencies first.' }
$settings = $settingsJson | ConvertFrom-Json
if (-not $settings.token -or $settings.token -match '\s' -or $settings.token.Length -lt 20) {
    throw 'Set NGROK_AUTHTOKEN in backend/.env from https://dashboard.ngrok.com/get-started/your-authtoken. Save the file and run this script again. Do not send the token in chat.'
}
if ($settings.port -lt 1 -or $settings.port -gt 65535 -or [int]$settings.port -ne $settings.port) { throw 'Invalid SEPAY_WEBHOOK_PORT.' }
if ($settings.domain -and $settings.domain -notmatch '^[a-z0-9][a-z0-9-]*\.(ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev)$') {
    throw 'NGROK_DOMAIN must be the ngrok hostname only, without https:// or a path.'
}
$ngrokCommand = Get-Command ngrok.exe -ErrorAction SilentlyContinue
if (-not $ngrokCommand) { throw 'Install ngrok first: winget install ngrok -s msstore' }

$upstream = 'http://127.0.0.1:' + $settings.port
$webhookPath = '/api/payments/sepay/webhook'
$healthUrl = $upstream + $webhookPath
$ready = $false
try { $ready = (Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2).mode -eq 'integrated' } catch {}
if (-not $ready) {
    if (Get-NetTCPConnection -LocalPort $settings.port -State Listen -ErrorAction SilentlyContinue) {
        throw 'The webhook gateway port is occupied or its backend is unavailable. Start the backend with start-project-local.ps1.'
    }
    $receiver = Start-Process -FilePath $node -ArgumentList @('"' + (Join-Path $PSScriptRoot 'sepay-webhook.cjs') + '"') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'receiver.log') -RedirectStandardError (Join-Path $runtimeDir 'receiver-error.log') -PassThru
    for ($attempt = 0; $attempt -lt 10; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $ready = (Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2).mode -eq 'integrated' } catch {}
        if ($ready) { break }
        if ($receiver.HasExited) { throw 'Webhook receiver exited. Inspect backend/.local/sepay/receiver-error.log.' }
    }
    if (-not $ready) { throw 'Webhook receiver did not start.' }
}

$stateFile = Join-Path $runtimeDir 'runtime.json'
$previousState = $null
$existingTunnel = $null
if (Test-Path -LiteralPath $stateFile) {
    $previousState = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    $existingTunnel = Get-Process -Id $previousState.tunnelPid -ErrorAction SilentlyContinue
    if ($previousState.provider -eq 'ngrok' -and -not $settings.domain) {
        $settings.domain = ([uri]$previousState.webhookUrl).Host
        if ($settings.domain -notmatch '^[a-z0-9][a-z0-9-]*\.(ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev)$') {
            throw 'Saved ngrok domain is invalid. Configure NGROK_DOMAIN in backend/.env.'
        }
    }
}

$agentApi = 'http://127.0.0.1:4043/api/tunnels'
$tunnel = $null
$startedTunnel = $false
if ($existingTunnel -and $existingTunnel.ProcessName -eq 'ngrok' -and $previousState.provider -eq 'ngrok') {
    $tunnel = $existingTunnel
} else {
    if (Get-NetTCPConnection -LocalPort 4043 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Port 4043 is occupied by another process. Stop that process before starting this project tunnel.'
    }
    # This file has no secrets. All credentials stay in backend/.env.
    $configPath = Join-Path $runtimeDir 'ngrok.yml'
    @'
version: "3"
agent:
  web_addr: 127.0.0.1:4043
  console_ui: false
  inspect_db_size: -1
  update_check: false
'@ | Set-Content -LiteralPath $configPath -Encoding UTF8
    $arguments = @('http', $upstream, '--config', ('"' + $configPath + '"'), '--inspect=false', '--log=stdout', '--log-format=json')
    if ($settings.domain) { $arguments += @('--url', ('https://' + $settings.domain)) }
    $previousToken = $env:NGROK_AUTHTOKEN
    try {
        $env:NGROK_AUTHTOKEN = $settings.token
        $tunnel = Start-Process -FilePath $ngrokCommand.Source -ArgumentList $arguments -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'ngrok.log') -RedirectStandardError (Join-Path $runtimeDir 'ngrok-error.log') -PassThru
        $startedTunnel = $true
    } finally {
        $env:NGROK_AUTHTOKEN = $previousToken
        $settings.token = $null
        $settingsJson = $null
    }
}

try {
    $url = $null
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        $tunnel.Refresh()
        if ($tunnel.HasExited) { throw 'ngrok exited. Check backend/.local/sepay/ngrok-error.log and ngrok.log for account/token errors.' }
        try {
            $endpoints = (Invoke-RestMethod -Uri $agentApi -TimeoutSec 2).tunnels
            $endpoint = $endpoints | Where-Object { $_.proto -eq 'https' -and $_.config.addr.TrimEnd('/') -eq $upstream } | Select-Object -First 1
            if ($endpoint) { $url = $endpoint.public_url.TrimEnd('/') + $webhookPath; break }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $url) { throw 'ngrok has not published the webhook. Check backend/.local/sepay/ngrok.log.' }
    $publicUri = [uri]$url
    if ($publicUri.Scheme -ne 'https' -or $publicUri.Host -notmatch '^[a-z0-9][a-z0-9-]*\.(ngrok-free\.app|ngrok-free\.dev|ngrok\.app|ngrok\.dev)$' -or
        ($settings.domain -and $publicUri.Host -ne $settings.domain)) {
        throw 'ngrok returned an unexpected public URL. The saved webhook URL was not changed.'
    }
    $publicHealth = Invoke-RestMethod -Uri $url -TimeoutSec 15 -Headers @{ 'ngrok-skip-browser-warning' = '1' }
    if ($publicHealth.mode -ne 'integrated') { throw 'The public ngrok URL did not reach the integrated backend.' }
    @{ provider = 'ngrok'; tunnelPid = $tunnel.Id; webhookUrl = $url; startedAt = (Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $stateFile
    Write-Output $url
    Write-Output 'Update the SePay dashboard webhook URL once. Keep MySQL, backend and ngrok running.'
    if ($existingTunnel -and $existingTunnel.ProcessName -eq 'cloudflared' -and
        $existingTunnel.Path -eq (Join-Path $runtimeDir 'cloudflared.exe')) {
        Stop-Process -Id $existingTunnel.Id -ErrorAction SilentlyContinue
    }
} catch {
    if ($startedTunnel -and -not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
    throw
}
