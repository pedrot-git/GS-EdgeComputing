#!/usr/bin/env bash
set -euo pipefail

FIWARE_HOST="${FIWARE_HOST:-localhost}"
FIWARE_SERVICE="${FIWARE_SERVICE:-smart}"
FIWARE_SERVICE_PATH="${FIWARE_SERVICE_PATH:-/}"
API_KEY="${API_KEY:-TEF}"
DEVICE_ID="${DEVICE_ID:-dragon001}"
ENTITY_ID="${ENTITY_ID:-urn:ngsi-ld:Dragon:001}"
ENTITY_TYPE="${ENTITY_TYPE:-DragonTelemetry}"

headers=(
  -H "Content-Type: application/json"
  -H "fiware-service: $FIWARE_SERVICE"
  -H "fiware-servicepath: $FIWARE_SERVICE_PATH"
)

request() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local output
  local status

  output="$(mktemp)"
  if [ -n "$body" ]; then
    status="$(curl -sS -o "$output" -w "%{http_code}" -X "$method" \
      "${headers[@]}" -d "$body" "$url")"
  else
    status="$(curl -sS -o "$output" -w "%{http_code}" -X "$method" \
      "${headers[@]}" "$url")"
  fi

  if [[ ! "$status" =~ ^2 ]]; then
    echo "Falha HTTP $status em $method $url" >&2
    cat "$output" >&2
    rm -f "$output"
    return 1
  fi

  cat "$output"
  rm -f "$output"
}

echo "Provisionando o dispositivo $DEVICE_ID no FIWARE..."

# Remove somente os recursos deste projeto para tornar o script repetivel.
request DELETE "http://$FIWARE_HOST:4041/iot/devices/$DEVICE_ID" >/dev/null 2>&1 || true

subscriptions="$(
  request GET "http://$FIWARE_HOST:1026/v2/subscriptions?limit=1000" |
    ENTITY_ID="$ENTITY_ID" python3 -c '
import json
import os
import sys

entity_id = os.environ["ENTITY_ID"]
for subscription in json.load(sys.stdin):
    entities = subscription.get("subject", {}).get("entities", [])
    if any(entity.get("id") == entity_id for entity in entities):
        print(subscription["id"])
'
)"

while IFS= read -r subscription_id; do
  [ -z "$subscription_id" ] && continue
  request DELETE "http://$FIWARE_HOST:1026/v2/subscriptions/$subscription_id" >/dev/null
done <<< "$subscriptions"

service_group="$(cat <<JSON
{
  "services": [{
    "apikey": "$API_KEY",
    "cbroker": "http://orion:1026",
    "entity_type": "Thing",
    "resource": ""
  }]
}
JSON
)"

# O grupo pode existir por causa de uma execucao anterior.
request POST "http://$FIWARE_HOST:4041/iot/services" "$service_group" >/dev/null 2>&1 || true

device="$(cat <<JSON
{
  "devices": [{
    "device_id": "$DEVICE_ID",
    "entity_name": "$ENTITY_ID",
    "entity_type": "$ENTITY_TYPE",
    "apikey": "$API_KEY",
    "protocol": "PDI-IoTA-UltraLight",
    "transport": "MQTT",
    "attributes": [
      { "object_id": "t", "name": "temperature", "type": "Float" },
      { "object_id": "p", "name": "pressure", "type": "Float" },
      { "object_id": "b", "name": "battery", "type": "Integer" },
      { "object_id": "v", "name": "vibration", "type": "Float" },
      { "object_id": "r", "name": "solarRisk", "type": "Integer" },
      { "object_id": "g", "name": "gpsQuality", "type": "Integer" },
      { "object_id": "source", "name": "source", "type": "Text" }
    ],
    "commands": [
      { "name": "setTelemetry", "type": "command" },
      { "name": "setMode", "type": "command" },
      { "name": "setRisk", "type": "command" }
    ]
  }]
}
JSON
)"
request POST "http://$FIWARE_HOST:4041/iot/devices" "$device" >/dev/null

entity="$(cat <<JSON
{
  "id": "$ENTITY_ID",
  "type": "$ENTITY_TYPE",
  "temperature": { "type": "Float", "value": 24.0 },
  "pressure": { "type": "Float", "value": 101.3 },
  "battery": { "type": "Integer", "value": 90 },
  "vibration": { "type": "Float", "value": 0.05 },
  "solarRisk": { "type": "Integer", "value": 20 },
  "gpsQuality": { "type": "Integer", "value": 95 },
  "operationalRisk": { "type": "Integer", "value": 0 },
  "status": { "type": "Text", "value": "NORMAL" },
  "source": { "type": "Text", "value": "LOCAL" }
}
JSON
)"
request POST "http://$FIWARE_HOST:1026/v2/entities?options=upsert" "$entity" >/dev/null

create_subscription() {
  local description="$1"
  local attributes="$2"
  local subscription

  subscription="$(cat <<JSON
{
  "description": "$description",
  "subject": {
    "entities": [{ "id": "$ENTITY_ID", "type": "$ENTITY_TYPE" }],
    "condition": { "attrs": $attributes }
  },
  "notification": {
    "http": { "url": "http://sth-comet:8666/notify" },
    "attrs": $attributes,
    "attrsFormat": "legacy"
  },
  "throttling": 1
}
JSON
)"
  request POST "http://$FIWARE_HOST:1026/v2/subscriptions" "$subscription" >/dev/null
}

create_subscription \
  "SolarNav Guard Dragon sensor history" \
  '["temperature","pressure","battery","vibration","solarRisk","gpsQuality","source"]'
create_subscription \
  "SolarNav Guard Dragon risk history" \
  '["operationalRisk","status"]'

request GET "http://$FIWARE_HOST:4041/iot/devices/$DEVICE_ID" >/dev/null
echo "Provisionamento concluido."
echo "Telemetria MQTT: /$API_KEY/$DEVICE_ID/attrs"
echo "Comandos MQTT:   /$API_KEY/$DEVICE_ID/cmd"
echo "Resultados MQTT: /$API_KEY/$DEVICE_ID/cmdexe"
