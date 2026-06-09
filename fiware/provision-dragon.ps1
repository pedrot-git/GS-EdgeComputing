param(
  [string]$HostName = "localhost",
  [string]$FiwareService = "smart",
  [string]$FiwareServicePath = "/",
  [string]$ApiKey = "TEF",
  [string]$DeviceId = "dragon001",
  [string]$EntityId = "urn:ngsi-ld:Dragon:001",
  [string]$EntityType = "DragonTelemetry",
  [string]$ContextBrokerUrlForIoTA = "http://orion:1026",
  [string]$SthNotifyUrlForOrion = "http://sth-comet:8666/notify"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$headers = @{
  "fiware-service" = $FiwareService
  "fiware-servicepath" = $FiwareServicePath
}

function Invoke-FiwareJson {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Method,
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [object]$Body = $null
  )

  $params = @{
    Method = $Method
    Uri = $Url
    Headers = $headers
    TimeoutSec = 20
  }

  if ($null -ne $Body) {
    $params.ContentType = "application/json"
    $params.Body = $Body | ConvertTo-Json -Depth 30
  }

  Invoke-RestMethod @params
}

function Write-Step {
  param([string]$Text)
  Write-Host "[OK] $Text" -ForegroundColor Green
}

function Remove-ExistingDevice {
  $deviceUrl = "http://$HostName`:4041/iot/devices/$DeviceId"
  try {
    Invoke-FiwareJson -Method Get -Url $deviceUrl | Out-Null
    Invoke-FiwareJson -Method Delete -Url $deviceUrl | Out-Null
    Write-Step "Configuracao anterior do dispositivo removida"
  }
  catch {
    if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404) {
      return
    }
    throw
  }
}

function Remove-DragonSubscriptions {
  $subscriptionsUrl = "http://$HostName`:1026/v2/subscriptions?limit=1000"
  $allSubscriptions = Invoke-FiwareJson -Method Get -Url $subscriptionsUrl
  $matches = @($allSubscriptions | Where-Object {
    @($_.subject.entities | Where-Object { $_.id -eq $EntityId }).Count -gt 0
  })

  foreach ($subscription in $matches) {
    try {
      Invoke-FiwareJson `
        -Method Delete `
        -Url "http://$HostName`:1026/v2/subscriptions/$($subscription.id)" | Out-Null
    }
    catch {
      if (-not ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 404)) {
        throw
      }
    }
  }

  if ($matches.Count -gt 0) {
    Write-Step "$($matches.Count) subscription(s) anterior(es) removida(s)"
  }
}

Write-Host "Reconciliando Dragon Telemetry no FIWARE" -ForegroundColor Cyan
Write-Host "Host: $HostName | Service: $FiwareService | Path: $FiwareServicePath"
Write-Host ""

Remove-ExistingDevice

$serviceGroup = @{
  services = @(
    @{
      apikey = $ApiKey
      cbroker = $ContextBrokerUrlForIoTA
      entity_type = "Thing"
      resource = ""
    }
  )
}

try {
  Invoke-FiwareJson `
    -Method Post `
    -Url "http://$HostName`:4041/iot/services" `
    -Body $serviceGroup | Out-Null
  Write-Step "Service group MQTT ($ApiKey) criado"
}
catch {
  $details = [string]$_.ErrorDetails.Message
  if ($details -match "DUPLICATE_GROUP") {
    Write-Step "Service group MQTT ($ApiKey) ja estava configurado"
  }
  else {
    throw
  }
}

$attributes = @(
  @{ object_id = "t"; name = "temperature"; type = "Float" }
  @{ object_id = "p"; name = "pressure"; type = "Float" }
  @{ object_id = "b"; name = "battery"; type = "Integer" }
  @{ object_id = "v"; name = "vibration"; type = "Float" }
  @{ object_id = "r"; name = "solarRisk"; type = "Integer" }
  @{ object_id = "g"; name = "gpsQuality"; type = "Integer" }
  @{ object_id = "source"; name = "source"; type = "Text" }
)

$device = @{
  devices = @(
    @{
      device_id = $DeviceId
      entity_name = $EntityId
      entity_type = $EntityType
      apikey = $ApiKey
      protocol = "PDI-IoTA-UltraLight"
      transport = "MQTT"
      attributes = $attributes
      commands = @(
        @{ name = "setTelemetry"; type = "command" }
        @{ name = "setMode"; type = "command" }
        @{ name = "setRisk"; type = "command" }
      )
    }
  )
}

Invoke-FiwareJson `
  -Method Post `
  -Url "http://$HostName`:4041/iot/devices" `
  -Body $device | Out-Null
Write-Step "Dispositivo $DeviceId criado com comandos bidirecionais"

$entity = @{
  id = $EntityId
  type = $EntityType
  temperature = @{ type = "Float"; value = 24.0 }
  pressure = @{ type = "Float"; value = 101.3 }
  battery = @{ type = "Integer"; value = 90 }
  vibration = @{ type = "Float"; value = 0.05 }
  solarRisk = @{ type = "Integer"; value = 20 }
  gpsQuality = @{ type = "Integer"; value = 95 }
  operationalRisk = @{ type = "Integer"; value = 0 }
  status = @{ type = "Text"; value = "NORMAL" }
  source = @{ type = "Text"; value = "LOCAL" }
}

Invoke-FiwareJson `
  -Method Post `
  -Url "http://$HostName`:1026/v2/entities?options=upsert" `
  -Body $entity | Out-Null
Write-Step "Entidade Orion criada ou atualizada"

Remove-DragonSubscriptions

$sensorHistoryAttributes = @(
  "temperature",
  "pressure",
  "battery",
  "vibration",
  "solarRisk",
  "gpsQuality",
  "source"
)

$riskHistoryAttributes = @(
  "operationalRisk",
  "status"
)

$subscriptions = @(
  @{
    description = "SolarNav Guard Dragon sensor history"
    attributes = $sensorHistoryAttributes
  },
  @{
    description = "SolarNav Guard Dragon risk history"
    attributes = $riskHistoryAttributes
  }
)

foreach ($definition in $subscriptions) {
  $subscription = @{
    description = $definition.description
    subject = @{
      entities = @(
        @{
          id = $EntityId
          type = $EntityType
        }
      )
      condition = @{
        attrs = $definition.attributes
      }
    }
    notification = @{
      http = @{
        url = $SthNotifyUrlForOrion
      }
      attrs = $definition.attributes
      attrsFormat = "legacy"
    }
    throttling = 1
  }

  Invoke-FiwareJson `
    -Method Post `
    -Url "http://$HostName`:1026/v2/subscriptions" `
    -Body $subscription | Out-Null
  Write-Step "Subscription criada: $($definition.description)"
}

$provisioned = Invoke-FiwareJson `
  -Method Get `
  -Url "http://$HostName`:4041/iot/devices/$DeviceId"

$commandNames = @($provisioned.commands | ForEach-Object { $_.name })
if (
  $commandNames -notcontains "setTelemetry" -or
  $commandNames -notcontains "setMode" -or
  $commandNames -notcontains "setRisk"
) {
  throw "O dispositivo foi criado sem os comandos esperados."
}

$allSubscriptions = Invoke-FiwareJson `
  -Method Get `
  -Url "http://$HostName`:1026/v2/subscriptions?limit=1000"
$subscriptions = @($allSubscriptions | Where-Object {
  $_.description -in @(
    "SolarNav Guard Dragon sensor history",
    "SolarNav Guard Dragon risk history"
  ) -and
  @($_.subject.entities | Where-Object { $_.id -eq $EntityId }).Count -gt 0
})

if ($subscriptions.Count -ne 2) {
  throw "Esperadas duas subscriptions Dragon, encontradas $($subscriptions.Count)."
}

Write-Host ""
Write-Host "Provisionamento validado com sucesso." -ForegroundColor Cyan
Write-Host "Telemetria: /$ApiKey/$DeviceId/attrs"
Write-Host "Comandos:   /$ApiKey/$DeviceId/cmd"
Write-Host "Resultados: /$ApiKey/$DeviceId/cmdexe"
