param(
  [string]$Payload = "t|24.0|p|101.3|b|90|v|0.05|r|20|g|95|source|LOCAL"
)

$ErrorActionPreference = "Stop"

Write-Host "Publicando amostra MQTT no Mosquitto do FIWARE Descomplicado..." -ForegroundColor Cyan
Write-Host "Topico: /TEF/dragon001/attrs"
Write-Host "Payload: $Payload"

docker exec fiware-mosquitto mosquitto_pub -h localhost -p 1883 -t "/TEF/dragon001/attrs" -m $Payload

Write-Host "Publicado. Consulte o Orion ou abra o dashboard." -ForegroundColor Green
