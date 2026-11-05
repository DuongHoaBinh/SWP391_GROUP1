$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $backendRoot
$runtimeDir = Join-Path $backendRoot '.local\sepay'
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
$node = (Get-Command node.exe).Source

if (-not (Test-Path -LiteralPath (Join-Path $backendRoot '.env'))) { throw 'Set up backend/.env first.' }
if (-not (Test-Path -LiteralPath (Join-Path $backendRoot 'dist\main.js'))) { throw 'Run npm run build in backend first.' }

# This machine's optional portable MySQL, isolated from standard port 3306.
$mysqlRoot = Join-Path $backendRoot '.local\mysql'
$mysqlExe = Join-Path $mysqlRoot 'mysql-8.4.13-winx64\bin\mysqld.exe'
if ((Test-Path -LiteralPath $mysqlExe) -and -not (Get-NetTCPConnection -LocalPort 3307 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath $mysqlExe -ArgumentList @('--no-defaults', "--basedir=$mysqlRoot\mysql-8.4.13-winx64", "--datadir=$mysqlRoot\data", '--bind-address=127.0.0.1', '--port=3307', '--mysqlx=OFF', '--local-infile=OFF') -WorkingDirectory $mysqlRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $mysqlRoot 'server.log') -RedirectStandardError (Join-Path $mysqlRoot 'server-error.log') | Out-Null
    Start-Sleep -Seconds 2
}

$healthUrl = 'http://127.0.0.1:5000/api/payments/sepay/webhook'
$ready = $false
try { $ready = (Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2).mode -eq 'integrated' } catch {}
if (-not $ready) {
    Start-Process -FilePath $node -ArgumentList @('dist/main.js') -WorkingDirectory $backendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'backend.log') -RedirectStandardError (Join-Path $runtimeDir 'backend-error.log') | Out-Null
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 500
        try { $ready = (Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2).mode -eq 'integrated' } catch {}
        if ($ready) { break }
    }
    if (-not $ready) { throw 'Backend is not ready. Inspect backend/.local/sepay/backend-error.log.' }
}

$frontendRoot = Join-Path $projectRoot 'frontend'
if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
    $nextMode = if (Test-Path -LiteralPath (Join-Path $frontendRoot '.next\BUILD_ID')) { 'start' } else { 'dev' }
    Start-Process -FilePath $node -ArgumentList @('node_modules/next/dist/bin/next', $nextMode, '-p', '3000') -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'frontend.log') -RedirectStandardError (Join-Path $runtimeDir 'frontend-error.log') | Out-Null
}
& (Join-Path $PSScriptRoot 'start-sepay-local.ps1')
Write-Output 'Frontend: http://localhost:3000'
