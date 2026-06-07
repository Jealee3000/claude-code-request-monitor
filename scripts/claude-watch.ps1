[CmdletBinding()]
param(
  [Alias("h")]
  [switch]$Help,

  [switch]$InspectBody,

  [string]$Project = (Get-Location).Path,

  [int]$ViewerPort = 43110,

  [int]$ProxyPort = 43111,

  [switch]$RestartWatcher,

  [switch]$NoClaude,

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ClaudeArgs
)

if ($Help) {
  @"
Claude Watch

Usage:
  .\scripts\claude-watch.ps1
  .\scripts\claude-watch.ps1 -InspectBody
  .\scripts\claude-watch.ps1 -Project D:\code\some-project -- --dangerously-skip-permissions
  .\scripts\claude-watch.ps1 -NoClaude

Options:
  -InspectBody   Enable local HTTPS MITM capture and redacted JSON body logging.
  -Project       Project directory where Claude Code should start.
  -ViewerPort    Local viewer port. Default: 43110.
  -ProxyPort     Local proxy port. Default: 43111.
  -RestartWatcher Stop existing processes that listen on the viewer/proxy ports before starting.
  -NoClaude      Start only the local service and viewer.
  --             Pass remaining arguments to claude.
"@
  exit 0
}

function Wait-ClaudeWatchHealth {
  param(
    [string]$ViewerUrl,
    [System.Diagnostics.Process]$Process,
    [string]$OutLog,
    [string]$ErrLog
  )

  $HealthUrl = "$ViewerUrl/healthz"
  $Deadline = (Get-Date).AddSeconds(25)

  while ((Get-Date) -lt $Deadline) {
    if ($Process.HasExited) {
      $Out = if (Test-Path $OutLog) { Get-Content -Raw $OutLog } else { "" }
      $Err = if (Test-Path $ErrLog) { Get-Content -Raw $ErrLog } else { "" }
      throw "Claude Watch service exited early.`nSTDOUT:`n$Out`nSTDERR:`n$Err"
    }

    try {
      $Response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
      if ($Response.ok) {
        return
      }
    }
    catch {
      Start-Sleep -Milliseconds 400
    }
  }

  throw "Timed out waiting for Claude Watch viewer at $HealthUrl"
}

function Wait-ClaudeWatchFile {
  param(
    [string]$Path,
    [System.Diagnostics.Process]$Process,
    [string]$Description
  )

  $Deadline = (Get-Date).AddSeconds(25)

  while ((Get-Date) -lt $Deadline) {
    if (Test-Path $Path) {
      return
    }
    if ($Process.HasExited) {
      throw "Claude Watch service exited before creating $Description at $Path"
    }
    Start-Sleep -Milliseconds 400
  }

  throw "Timed out waiting for $Description at $Path"
}

function Get-ClaudeWatchPortListeners {
  param(
    [int[]]$Ports
  )

  $Listeners = @()

  foreach ($Port in $Ports) {
    $Connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue

    foreach ($Connection in $Connections) {
      $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $($Connection.OwningProcess)" -ErrorAction SilentlyContinue
      $Listeners += [PSCustomObject]@{
        Port = $Port
        ProcessId = $Connection.OwningProcess
        CommandLine = if ($Process) { $Process.CommandLine } else { "" }
      }
    }
  }

  return $Listeners
}

function Ensure-ClaudeWatchPortsAvailable {
  param(
    [int[]]$Ports,
    [switch]$RestartWatcher
  )

  $Listeners = @(Get-ClaudeWatchPortListeners -Ports $Ports)
  if ($Listeners.Count -eq 0) {
    return
  }

  $Summary = ($Listeners | ForEach-Object {
    "port $($_.Port) is used by PID $($_.ProcessId)"
  }) -join "; "

  if (-not $RestartWatcher) {
    throw "Claude Watch port already in use: $Summary. Stop the old watcher first, or re-run with -RestartWatcher."
  }

  $ProcessIds = $Listeners | Select-Object -ExpandProperty ProcessId -Unique
  foreach ($ProcessId in $ProcessIds) {
    Stop-Process -Id $ProcessId -Force
  }

  $Deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $Deadline) {
    $Remaining = @(Get-ClaudeWatchPortListeners -Ports $Ports)
    if ($Remaining.Count -eq 0) {
      return
    }
    Start-Sleep -Milliseconds 250
  }

  throw "Timed out waiting for old Claude Watch listener(s) to release ports: $Summary"
}

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $RepoRoot ".claude-watch"
$LogsDir = Join-Path $DataDir "logs"
New-Item -ItemType Directory -Force $LogsDir | Out-Null

$SessionId = "session-" + (Get-Date -Format "yyyyMMddHHmmss") + "-" + ([Guid]::NewGuid().ToString("N").Substring(0, 6))
$ViewerUrl = "http://127.0.0.1:$ViewerPort"
$ProxyUrl = "http://127.0.0.1:$ProxyPort"
$OutLog = Join-Path $LogsDir "$SessionId.out.log"
$ErrLog = Join-Path $LogsDir "$SessionId.err.log"

$ServiceArgs = @(
  "run", "dev", "--",
  "--session-id", $SessionId,
  "--project", (Resolve-Path $Project).Path,
  "--viewer-port", "$ViewerPort",
  "--proxy-port", "$ProxyPort",
  "--data-dir", $DataDir
)

if ($InspectBody) {
  $ServiceArgs += "--inspect-body"
}

Ensure-ClaudeWatchPortsAvailable -Ports @($ViewerPort, $ProxyPort) -RestartWatcher:$RestartWatcher

Write-Output "Starting Claude Watch service..."
$Service = Start-Process `
  -FilePath "npm.cmd" `
  -ArgumentList $ServiceArgs `
  -WorkingDirectory $RepoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLog `
  -RedirectStandardError $ErrLog `
  -PassThru

Wait-ClaudeWatchHealth -ViewerUrl $ViewerUrl -Process $Service -OutLog $OutLog -ErrLog $ErrLog

$CaPath = Join-Path $DataDir "mitm\certs\ca.pem"
if ($InspectBody) {
  Wait-ClaudeWatchFile -Path $CaPath -Process $Service -Description "local CA certificate"
}

Write-Output "Claude Watch viewer: $ViewerUrl"
Write-Output "Claude Watch proxy:  $ProxyUrl"
Write-Output "Claude Watch session: $SessionId"
Write-Output "Claude Watch service PID: $($Service.Id)"

if ($NoClaude) {
  Write-Output "Started without Claude Code. Stop it with: Stop-Process -Id $($Service.Id)"
  exit 0
}

$ClaudeCommand = Get-Command "claude" -ErrorAction SilentlyContinue
if (-not $ClaudeCommand) {
  Write-Error "Could not find 'claude' on PATH. The viewer is still running at $ViewerUrl. Stop service PID $($Service.Id) when finished."
  exit 1
}

$OldHttpProxy = $env:HTTP_PROXY
$OldHttpsProxy = $env:HTTPS_PROXY
$OldSessionId = $env:CLAUDE_WATCH_SESSION_ID
$OldNodeExtraCaCerts = $env:NODE_EXTRA_CA_CERTS

try {
  $env:HTTP_PROXY = $ProxyUrl
  $env:HTTPS_PROXY = $ProxyUrl
  $env:CLAUDE_WATCH_SESSION_ID = $SessionId
  if ($InspectBody) {
    $env:NODE_EXTRA_CA_CERTS = $CaPath
  }

  Push-Location (Resolve-Path $Project).Path
  try {
    & $ClaudeCommand.Source @ClaudeArgs
    $ClaudeExitCode = if ($null -eq $LASTEXITCODE) { 0 } else { $LASTEXITCODE }
  }
  finally {
    Pop-Location
  }
}
finally {
  $env:HTTP_PROXY = $OldHttpProxy
  $env:HTTPS_PROXY = $OldHttpsProxy
  $env:CLAUDE_WATCH_SESSION_ID = $OldSessionId
  $env:NODE_EXTRA_CA_CERTS = $OldNodeExtraCaCerts
}

Write-Output "Claude exited. Logs remain available at $ViewerUrl"
Write-Output "Stop the watcher with: Stop-Process -Id $($Service.Id)"
exit $ClaudeExitCode
