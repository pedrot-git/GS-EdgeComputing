#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="/opt/solarnav-risk"
SERVICE_PATH="/etc/systemd/system/solarnav-risk.service"

sudo install -d -m 0755 "$INSTALL_DIR"
sudo install -m 0755 "$SCRIPT_DIR/risk_processor.py" "$INSTALL_DIR/risk_processor.py"
sudo install -m 0644 "$SCRIPT_DIR/solarnav-risk.service" "$SERVICE_PATH"
sudo systemctl daemon-reload
sudo systemctl enable --now solarnav-risk.service

echo
sudo systemctl --no-pager --full status solarnav-risk.service
