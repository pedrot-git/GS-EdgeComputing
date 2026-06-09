#!/usr/bin/env bash
set -euo pipefail

FIWARE_REPO="${FIWARE_REPO:-https://github.com/fabiocabrini/fiware}"
FIWARE_DIR="${FIWARE_DIR:-$HOME/fiware}"
FIWARE_SERVICE="${FIWARE_SERVICE:-smart}"
FIWARE_SERVICE_PATH="${FIWARE_SERVICE_PATH:-/}"
API_KEY="${API_KEY:-TEF}"
DEVICE_ID="${DEVICE_ID:-dragon001}"
ENTITY_ID="${ENTITY_ID:-urn:ngsi-ld:Dragon:001}"
ENTITY_TYPE="${ENTITY_TYPE:-DragonTelemetry}"
MOSQUITTO_CONTAINER="${MOSQUITTO_CONTAINER:-fiware-mosquitto}"

header() {
  printf '\n== %s ==\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

curl_status() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local tmp
  local status
  tmp="$(mktemp)"

  if [ -n "$body" ]; then
    status="$(
      curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url" \
        -H "Content-Type: application/json" \
        -H "fiware-service: $FIWARE_SERVICE" \
        -H "fiware-servicepath: $FIWARE_SERVICE_PATH" \
        -d "$body"
    )"
  else
    status="$(
      curl -sS -o "$tmp" -w "%{http_code}" -X "$method" "$url" \
        -H "fiware-service: $FIWARE_SERVICE" \
        -H "fiware-servicepath: $FIWARE_SERVICE_PATH"
    )"
  fi

  printf 'HTTP %s %s\n' "$status" "$url"
  cat "$tmp"
  printf '\n'
  rm -f "$tmp"

  case "$status" in
    200|201|204|409|422) return 0 ;;
    *) return 1 ;;
  esac
}

curl_expect_ok() {
  local url="$1"
  local tmp
  local status
  tmp="$(mktemp)"
  status="$(curl -sS -o "$tmp" -w "%{http_code}" "$url")"
  printf 'HTTP %s %s\n' "$status" "$url"
  cat "$tmp"
  printf '\n'
  rm -f "$tmp"

  case "$status" in
    200|201|204) return 0 ;;
    *) return 1 ;;
  esac
}

require_command git
require_command curl
require_command docker

header "Clone or update FIWARE Descomplicado"
if [ ! -d "$FIWARE_DIR/.git" ]; then
  git clone "$FIWARE_REPO" "$FIWARE_DIR"
else
  echo "Using existing repository: $FIWARE_DIR"
fi

cd "$FIWARE_DIR"

header "Start FIWARE containers"
if docker compose version >/dev/null 2>&1; then
  sudo docker compose up -d
else
  require_command docker-compose
  sudo docker-compose up -d
fi

header "Containers"
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

header "FIWARE healthcheck"
curl_expect_ok "http://localhost:1026/version"
curl_expect_ok "http://localhost:4041/iot/about"
curl_expect_ok "http://localhost:8666/version"
curl_status GET "http://localhost:4041/iot/services"

header "Provision IoT Agent service group"
curl_status POST "http://localhost:4041/iot/services" '{
  "services": [
    {
      "apikey": "TEF",
      "cbroker": "http://orion:1026",
      "entity_type": "Thing",
      "resource": ""
    }
  ]
}'

header "Provision Dragon device"
curl_status POST "http://localhost:4041/iot/devices" '{
  "devices": [
    {
      "device_id": "dragon001",
      "entity_name": "urn:ngsi-ld:Dragon:001",
      "entity_type": "DragonTelemetry",
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
    }
  ]
}'

header "Create Orion entity"
curl_status POST "http://localhost:1026/v2/entities" '{
  "id": "urn:ngsi-ld:Dragon:001",
  "type": "DragonTelemetry",
  "temperature": { "type": "Float", "value": 24.0 },
  "pressure": { "type": "Float", "value": 101.3 },
  "battery": { "type": "Integer", "value": 100 },
  "vibration": { "type": "Float", "value": 0.0 },
  "solarRisk": { "type": "Integer", "value": 0 },
  "gpsQuality": { "type": "Integer", "value": 100 },
  "operationalRisk": { "type": "Integer", "value": 0 },
  "status": { "type": "Text", "value": "NORMAL" },
  "source": { "type": "Text", "value": "LOCAL" }
}'

header "Create Orion sensor subscription"
curl_status POST "http://localhost:1026/v2/subscriptions" '{
  "description": "SolarNav Guard Dragon sensor history",
  "subject": {
    "entities": [
      {
        "id": "urn:ngsi-ld:Dragon:001",
        "type": "DragonTelemetry"
      }
    ],
    "condition": {
      "attrs": ["temperature", "pressure", "battery", "vibration", "solarRisk", "gpsQuality", "source"]
    }
  },
  "notification": {
    "http": {
      "url": "http://sth-comet:8666/notify"
    },
    "attrs": ["temperature", "pressure", "battery", "vibration", "solarRisk", "gpsQuality", "source"],
    "attrsFormat": "legacy"
  },
  "throttling": 1
}'

header "Create Orion risk subscription"
curl_status POST "http://localhost:1026/v2/subscriptions" '{
  "description": "SolarNav Guard Dragon risk history",
  "subject": {
    "entities": [
      {
        "id": "urn:ngsi-ld:Dragon:001",
        "type": "DragonTelemetry"
      }
    ],
    "condition": {
      "attrs": ["operationalRisk", "status"]
    }
  },
  "notification": {
    "http": {
      "url": "http://sth-comet:8666/notify"
    },
    "attrs": ["operationalRisk", "status"],
    "attrsFormat": "legacy"
  },
  "throttling": 1
}'

header "Publish MQTT samples"
sudo docker exec "$MOSQUITTO_CONTAINER" mosquitto_pub \
  -h localhost -p 1883 \
  -t "/$API_KEY/$DEVICE_ID/attrs" \
  -m "t|24.0|p|101.3|b|90|v|0.05|r|20|g|95|source|LOCAL"

sleep 2

sudo docker exec "$MOSQUITTO_CONTAINER" mosquitto_pub \
  -h localhost -p 1883 \
  -t "/$API_KEY/$DEVICE_ID/attrs" \
  -m "t|38|p|110|b|5|v|1.5|r|100|g|10|source|REMOTE"

sleep 2

header "Current Orion entity"
curl_status GET "http://localhost:1026/v2/entities/$ENTITY_ID"

header "STH-Comet operationalRisk history"
curl_status GET "http://localhost:8666/STH/v1/contextEntities/type/$ENTITY_TYPE/id/$ENTITY_ID/attributes/operationalRisk?lastN=10"

header "External access hints"
PUBLIC_IP="$(curl -sS --max-time 5 https://api.ipify.org || true)"
if [ -n "$PUBLIC_IP" ]; then
  echo "Possible public IP: $PUBLIC_IP"
  echo "Dashboard command on Windows:"
  echo "  cd \"C:\\Users\\pedro\\OneDrive\\Área de Trabalho\\GS\\dashboard\""
  echo "  \$env:FIWARE_HOST=\"$PUBLIC_IP\""
  echo "  npm start"
fi

echo
echo "FIWARE Dragon telemetry test finished."
