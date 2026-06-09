#!/usr/bin/env python3
import json
import logging
import math
import os
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


SENSOR_ATTRIBUTES = (
    "temperature",
    "pressure",
    "battery",
    "vibration",
    "solarRisk",
    "gpsQuality",
)


@dataclass(frozen=True)
class Telemetry:
    temperature: float
    pressure: float
    battery: int
    vibration: float
    solar_risk: int
    gps_quality: int


def score_high(value: float, warning: float, critical: float) -> int:
    if value <= warning:
        return 0
    if value >= critical:
        return 100
    return int(((value - warning) / (critical - warning)) * 100)


def score_low(value: float, warning: float, critical: float) -> int:
    if value >= warning:
        return 0
    if value <= critical:
        return 100
    return int(((warning - value) / (warning - critical)) * 100)


def calculate_risk(data: Telemetry) -> int:
    temperature_risk = max(
        score_high(data.temperature, 29.0, 36.0),
        score_low(data.temperature, 18.0, 12.0),
    )
    pressure_risk = score_high(abs(data.pressure - 101.3), 4.0, 10.0)
    battery_risk = score_low(data.battery, 45.0, 15.0)
    vibration_risk = score_high(data.vibration, 1.1, 2.3)
    gps_risk = score_low(data.gps_quality, 65.0, 30.0)

    weighted = (
        temperature_risk * 0.15
        + pressure_risk * 0.20
        + battery_risk * 0.15
        + vibration_risk * 0.15
        + data.solar_risk * 0.20
        + gps_risk * 0.15
    )
    return min(max(int(math.floor(weighted + 0.5)), 0), 100)


def state_from_risk(risk: int) -> str:
    if risk >= 70:
        return "CRITICO"
    if risk >= 40:
        return "ATENCAO"
    return "NORMAL"


def _number(entity: dict[str, Any], name: str) -> float:
    attribute = entity.get(name)
    if not isinstance(attribute, dict) or "value" not in attribute:
        raise ValueError(f"Atributo ausente: {name}")

    value = attribute["value"]
    if isinstance(value, bool):
        raise ValueError(f"Valor invalido para {name}: {value}")

    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"Valor invalido para {name}: {value}") from error

    if not math.isfinite(number):
        raise ValueError(f"Valor invalido para {name}: {value}")
    return number


def telemetry_from_entity(entity: dict[str, Any]) -> Telemetry:
    temperature = _number(entity, "temperature")
    pressure = _number(entity, "pressure")
    battery = _number(entity, "battery")
    vibration = _number(entity, "vibration")
    solar_risk = _number(entity, "solarRisk")
    gps_quality = _number(entity, "gpsQuality")

    ranges = {
        "temperature": (-40.0, 85.0, temperature),
        "pressure": (88.0, 112.0, pressure),
        "battery": (0.0, 100.0, battery),
        "vibration": (0.0, 3.0, vibration),
        "solarRisk": (0.0, 100.0, solar_risk),
        "gpsQuality": (0.0, 100.0, gps_quality),
    }
    for name, (minimum, maximum, value) in ranges.items():
        if not minimum <= value <= maximum:
            raise ValueError(f"{name} fora da faixa: {value}")

    for name, value in (
        ("battery", battery),
        ("solarRisk", solar_risk),
        ("gpsQuality", gps_quality),
    ):
        if not value.is_integer():
            raise ValueError(f"{name} deve ser inteiro: {value}")

    return Telemetry(
        temperature=temperature,
        pressure=pressure,
        battery=int(battery),
        vibration=vibration,
        solar_risk=int(solar_risk),
        gps_quality=int(gps_quality),
    )


def sensor_revision(entity: dict[str, Any]) -> str:
    fallback_time = entity.get("TimeInstant", {}).get("value", "")
    revision = []
    for name in SENSOR_ATTRIBUTES:
        attribute = entity.get(name, {})
        metadata_time = (
            attribute.get("metadata", {})
            .get("TimeInstant", {})
            .get("value", fallback_time)
        )
        revision.append((name, attribute.get("value"), metadata_time))
    return json.dumps(revision, separators=(",", ":"), ensure_ascii=True)


class FiwareClient:
    def __init__(
        self,
        orion_url: str,
        service: str,
        service_path: str,
        entity_id: str,
        entity_type: str,
        timeout: float = 5.0,
    ) -> None:
        self.orion_url = orion_url.rstrip("/")
        self.service = service
        self.service_path = service_path
        self.entity_id = entity_id
        self.entity_type = entity_type
        self.timeout = timeout

    def _request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers = {
            "Accept": "application/json",
            "fiware-service": self.service,
            "fiware-servicepath": self.service_path,
        }
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, separators=(",", ":")).encode("utf-8")

        request = Request(
            f"{self.orion_url}{path}",
            data=data,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                payload = response.read()
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Orion respondeu HTTP {error.code}: {details}"
            ) from error
        except URLError as error:
            raise RuntimeError(f"Nao foi possivel acessar o Orion: {error}") from error

        return json.loads(payload) if payload else {}

    def get_entity(self) -> dict[str, Any]:
        entity = quote(self.entity_id, safe="")
        attrs = ",".join((*SENSOR_ATTRIBUTES, "TimeInstant"))
        return self._request(
            "GET",
            f"/v2/entities/{entity}?type={quote(self.entity_type)}&attrs={attrs}",
        )

    def update_computed(self, risk: int, state: str) -> None:
        entity = quote(self.entity_id, safe="")
        self._request(
            "PATCH",
            f"/v2/entities/{entity}/attrs?type={quote(self.entity_type)}",
            {
                "operationalRisk": {"type": "Integer", "value": risk},
                "status": {"type": "Text", "value": state},
            },
        )

    def send_set_risk(self, risk: int, state: str) -> None:
        entity = quote(self.entity_id, safe="")
        self._request(
            "PATCH",
            f"/v2/entities/{entity}/attrs?type={quote(self.entity_type)}",
            {
                "setRisk": {
                    "type": "command",
                    "value": {"risk": risk, "status": state},
                }
            },
        )


class RiskProcessor:
    def __init__(self, client: FiwareClient) -> None:
        self.client = client
        self.last_revision: str | None = None

    def process_once(self) -> bool:
        entity = self.client.get_entity()
        revision = sensor_revision(entity)
        if revision == self.last_revision:
            return False

        telemetry = telemetry_from_entity(entity)
        risk = calculate_risk(telemetry)
        state = state_from_risk(risk)

        self.client.update_computed(risk, state)
        self.client.send_set_risk(risk, state)
        self.last_revision = revision
        logging.info("Risco calculado: %s/100 (%s)", risk, state)
        return True


def main() -> None:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(message)s",
    )
    interval = max(float(os.getenv("POLL_INTERVAL_SECONDS", "1")), 0.2)
    client = FiwareClient(
        orion_url=os.getenv("ORION_URL", "http://localhost:1026"),
        service=os.getenv("FIWARE_SERVICE", "smart"),
        service_path=os.getenv("FIWARE_SERVICE_PATH", "/"),
        entity_id=os.getenv("ENTITY_ID", "urn:ngsi-ld:Dragon:001"),
        entity_type=os.getenv("ENTITY_TYPE", "DragonTelemetry"),
        timeout=float(os.getenv("FIWARE_TIMEOUT_SECONDS", "5")),
    )
    processor = RiskProcessor(client)

    logging.info("Processador de risco iniciado em %s", client.orion_url)
    while True:
        try:
            processor.process_once()
        except (RuntimeError, ValueError) as error:
            logging.error("%s", error)
        except Exception:
            logging.exception("Falha inesperada ao processar telemetria")
        time.sleep(interval)


if __name__ == "__main__":
    main()
