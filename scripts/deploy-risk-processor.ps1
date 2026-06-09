param(
  [Parameter(Mandatory = $true)]
  [string]$HostName,

  [string]$User = "pedrot_ytb",
  [string]$IdentityFile = "",
  [int]$Port = 22
)

$ErrorActionPreference = "Stop"

$sourceDirectory = Join-Path $PSScriptRoot "..\risk-processor"
$requiredFiles = @(
  "risk_processor.py",
  "solarnav-risk.service",
  "install.sh"
)

foreach ($file in $requiredFiles) {
  $path = Join-Path $sourceDirectory $file
  if (-not (Test-Path $path)) {
    throw "Arquivo necessario nao encontrado: $path"
  }
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
$remoteCommand = 'set -e; tmp="$(mktemp -d)"; trap ''rm -rf "$tmp"'' EXIT; tar -xf - -C "$tmp"; bash "$tmp/install.sh"'

Write-Host "Enviando processador de risco para $target..." -ForegroundColor Cyan
tar -C $sourceDirectory -cf - @requiredFiles |
  ssh @sshArgs $target $remoteCommand

if ($LASTEXITCODE -ne 0) {
  throw "Falha ao instalar o processador de risco na VM."
}

Write-Host "Processador de risco instalado e iniciado." -ForegroundColor Green
