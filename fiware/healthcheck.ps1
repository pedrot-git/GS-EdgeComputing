param(
  [string]$HostName = "localhost"
)

$ErrorActionPreference = "Stop"

function Test-Endpoint {
  param(
    [string]$Name,
    [string]$Url,
    [hashtable]$Headers = @{}
  )

  try {
    $response = Invoke-RestMethod -Method Get -Uri $Url -Headers $Headers -TimeoutSec 8
    Write-Host "[OK] $Name -> $Url" -ForegroundColor Green
    return $response
  }
  catch {
    Write-Host "[ERRO] $Name -> $Url" -ForegroundColor Red
    Write-Host "      $($_.Exception.Message)" -ForegroundColor DarkYellow
  }
}

$fiwareHeaders = @{
  "fiware-service" = "smart"
  "fiware-servicepath" = "/"
}

Write-Host "SolarNav Guard - Healthcheck FIWARE" -ForegroundColor Cyan
Write-Host "Host: $HostName"
Write-Host ""

Test-Endpoint "Orion Context Broker" "http://$HostName`:1026/version" | Out-Null
Test-Endpoint "IoT Agent MQTT" "http://$HostName`:4041/iot/about" | Out-Null
Test-Endpoint "STH-Comet" "http://$HostName`:8666/version" | Out-Null
Test-Endpoint "Service groups IoT Agent" "http://$HostName`:4041/iot/services" $fiwareHeaders | Out-Null

Write-Host ""
Write-Host "Se todos aparecem como [OK], rode: .\provision-dragon.ps1" -ForegroundColor Cyan
