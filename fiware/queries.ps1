param(
  [string]$HostName = "localhost",
  [string]$Attr = "operationalRisk",
  [int]$LastN = 20
)

$ErrorActionPreference = "Stop"

$headers = @{
  "fiware-service" = "smart"
  "fiware-servicepath" = "/"
  "Accept" = "application/json"
}

$entityId = "urn:ngsi-ld:Dragon:001"
$entityType = "DragonTelemetry"

Write-Host "Entidade atual no Orion" -ForegroundColor Cyan
Invoke-RestMethod `
  -Method Get `
  -Uri "http://$HostName`:1026/v2/entities/$entityId" `
  -Headers $headers |
  ConvertTo-Json -Depth 20

Write-Host ""
Write-Host "Historico STH-Comet do atributo '$Attr'" -ForegroundColor Cyan
Invoke-RestMethod `
  -Method Get `
  -Uri "http://$HostName`:8666/STH/v1/contextEntities/type/$entityType/id/$entityId/attributes/$Attr`?lastN=$LastN" `
  -Headers $headers |
  ConvertTo-Json -Depth 20
