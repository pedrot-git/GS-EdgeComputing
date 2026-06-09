param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "pedrot_ytb",
  [string]$IdentityFile = "",
  [int]$Port = 22
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $PSScriptRoot "vm-fiware-test.sh"
if (-not (Test-Path $scriptPath)) {
  throw "Script not found: $scriptPath"
}

$sshArgs = @(
  "-p", $Port,
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=4"
)

if ($IdentityFile) {
  $sshArgs += @("-i", $IdentityFile)
}

$target = "$User@$HostName"
Write-Host "Running FIWARE test on $target..." -ForegroundColor Cyan

Get-Content -Raw $scriptPath | ssh @sshArgs $target "bash -s"
