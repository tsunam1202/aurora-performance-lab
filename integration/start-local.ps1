param([ValidateRange(1,65535)][int]$Port = 4180, [switch]$NoOpen)
$ErrorActionPreference = 'Stop'
$serverPath = Join-Path $PSScriptRoot 'server.cjs'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw 'Node.js 20 or newer is required. Install it, then run this launcher again.' }
$localUrl = "http://127.0.0.1:$Port"
$running = $false
try { $health = Invoke-RestMethod -Uri "$localUrl/__aurora_health" -TimeoutSec 2; $running = $health.app -eq 'aurora-performance-lab' } catch {}
if (-not $running) {
  $logDirectory = Join-Path $env:LOCALAPPDATA 'AuroraPerformanceLab'
  [void](New-Item -ItemType Directory -Path $logDirectory -Force)
  $nodeArguments = '"' + $serverPath + '" --port ' + $Port
  $worker = Start-Process -FilePath $nodePath -ArgumentList $nodeArguments -WorkingDirectory (Split-Path $PSScriptRoot -Parent) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDirectory "preview-$Port.log") -RedirectStandardError (Join-Path $logDirectory "preview-$Port.error.log")
  $deadline = (Get-Date).AddSeconds(10)
  do {
    Start-Sleep -Milliseconds 200
    if ($worker.HasExited) { throw "Local server failed to start. See $logDirectory\preview-$Port.error.log" }
    try { $health = Invoke-RestMethod -Uri "$localUrl/__aurora_health" -TimeoutSec 1; $running = $health.app -eq 'aurora-performance-lab' } catch {}
  } until ($running -or (Get-Date) -gt $deadline)
  if (-not $running) { throw 'Local server did not become ready.' }
}
if (-not $NoOpen) { Start-Process "$localUrl/#home" }
Write-Output "AURORA: $localUrl/#home"
