#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIWARE_REPO="${FIWARE_REPO:-https://github.com/fabiocabrini/fiware.git}"
FIWARE_REF="${FIWARE_REF:-3055be87319b419203e15d8f1dc3c96c17ee7b62}"
FIWARE_DIR="${FIWARE_DIR:-$HOME/fiware}"

if ! command -v sudo >/dev/null 2>&1; then
  echo "O comando sudo nao esta instalado." >&2
  exit 1
fi

echo "== Instalando dependencias da VM =="
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git python3 docker.io

if ! docker compose version >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2 ||
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose
fi

sudo systemctl enable --now docker

echo "== Obtendo o FIWARE Descomplicado =="
if [ ! -d "$FIWARE_DIR/.git" ]; then
  git clone "$FIWARE_REPO" "$FIWARE_DIR"
fi

git -C "$FIWARE_DIR" fetch origin
git -C "$FIWARE_DIR" checkout --detach "$FIWARE_REF"

echo "== Iniciando Orion, IoT Agent, STH-Comet, MongoDB e Mosquitto =="
if sudo docker compose version >/dev/null 2>&1; then
  sudo docker compose -f "$FIWARE_DIR/docker-compose.yml" up -d
else
  sudo docker-compose -f "$FIWARE_DIR/docker-compose.yml" up -d
fi

echo "== Aguardando os servicos FIWARE =="
wait_for_endpoint() {
  local name="$1"
  local url="$2"

  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null; then
      echo "[OK] $name"
      return
    fi
    sleep 2
  done

  echo "Tempo esgotado aguardando $name em $url" >&2
  exit 1
}

wait_for_endpoint "Orion Context Broker" "http://localhost:1026/version"
wait_for_endpoint "IoT Agent MQTT" "http://localhost:4041/iot/about"
wait_for_endpoint "STH-Comet" "http://localhost:8666/version"

echo "== Provisionando o SolarNav Guard =="
bash "$PROJECT_DIR/fiware/provision-dragon.sh"

echo "== Instalando o processador de risco =="
bash "$PROJECT_DIR/risk-processor/install.sh"

echo "== Validando a instalacao =="
curl -fsS \
  -H "fiware-service: smart" \
  -H "fiware-servicepath: /" \
  "http://localhost:1026/v2/entities/urn:ngsi-ld:Dragon:001" >/dev/null
sudo systemctl is-active --quiet solarnav-risk.service
sudo docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

cat <<'TEXT'

Instalacao concluida.

Verificacoes uteis:
  sudo systemctl status solarnav-risk.service
  sudo journalctl -u solarnav-risk.service -f
  curl http://localhost:1026/version

Nao exponha a porta 27017 do MongoDB na regra de firewall da nuvem.
TEXT
