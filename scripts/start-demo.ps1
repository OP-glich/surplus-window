param([ValidateSet('demo', 'normal')][string]$Mode = 'demo')
$ErrorActionPreference = 'Stop'
$launcher = if ($Mode -eq 'demo') { 'Start Demo.cmd' } else { 'Start App.cmd' }
$command = if ($Mode -eq 'demo') { 'npm.cmd run demo' } else { 'npm.cmd start' }
$project = Split-Path -Parent $PSScriptRoot
$port = 3000

if (Test-Path -LiteralPath (Join-Path $project '.env')) {
  foreach ($line in [IO.File]::ReadAllLines((Join-Path $project '.env'))) {
    if ($line -match '^\s*PORT\s*=\s*(\d+)\s*$') {
      $port = [int]$Matches[1]
    }
  }
}
if ($env:PORT) {
  if ($env:PORT -notmatch '^\d+$') {
    Write-Host 'PORT must be a number from 1 to 65535.'
    exit 1
  }
  $port = [int]$env:PORT
}
if ($port -lt 1 -or $port -gt 65535) {
  Write-Host 'PORT must be a number from 1 to 65535.'
  exit 1
}

$socket = [Net.Sockets.TcpClient]::new()
try {
  if ($socket.ConnectAsync('127.0.0.1', $port).Wait(350)) {
    Write-Host "Port $port is already in use. Close the app using that port, or choose another PORT in .env, then double-click $launcher again."
    exit 1
  }
} catch {
  # A refused connection means the port is available.
} finally {
  $socket.Dispose()
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  Write-Host "npm.cmd was not found. Install Node.js, then double-click $launcher again."
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $project 'node_modules\better-sqlite3'))) {
  Write-Host "Dependencies are missing. Run npm.cmd ci in the project folder once, then double-click $launcher again."
  exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host "Starting Surplus Window ($Mode) from $project"
Write-Host 'The server opens in a separate window. Closing that window stops the app.'
$server = Start-Process -FilePath $env:ComSpec -ArgumentList '/k', "set PORT=$port&&$command" -WorkingDirectory $project -WindowStyle Normal -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  Start-Sleep -Milliseconds 500
  if ($server.HasExited) {
    Write-Host 'The server window closed before the app became ready.'
    exit 1
  }
  try {
    $health = Invoke-RestMethod "http://127.0.0.1:$port/api/health" -TimeoutSec 1
    if ($health.status -eq 'ok' -and $health.mode -eq $Mode) {
      $ready = $true
      break
    }
  } catch {
    # The server is still starting.
  }
}
if (-not $ready) {
  Write-Host "The app did not become ready at $url within 30 seconds. Check the server window for the error."
  exit 1
}
Write-Host "Ready: $url"
try {
  Start-Process $url -ErrorAction Stop
} catch {
  Write-Host "The browser could not open automatically. Open $url in your browser."
}
