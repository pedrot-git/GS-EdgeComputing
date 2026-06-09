import unittest

from risk_processor import (
    RiskProcessor,
    Telemetry,
    calculate_risk,
    state_from_risk,
    telemetry_from_entity,
)


def entity_for(data: Telemetry, timestamp: str = "2026-06-09T15:00:00.000Z"):
    values = {
        "temperature": data.temperature,
        "pressure": data.pressure,
        "battery": data.battery,
        "vibration": data.vibration,
        "solarRisk": data.solar_risk,
        "gpsQuality": data.gps_quality,
    }
    return {
        name: {
            "type": "Float",
            "value": value,
            "metadata": {
                "TimeInstant": {"type": "DateTime", "value": timestamp}
            },
        }
        for name, value in values.items()
    }


class FakeClient:
    def __init__(self, entity):
        self.entity = entity
        self.computed = []
        self.commands = []
        self.fail_command = False

    def get_entity(self):
        return self.entity

    def update_computed(self, risk, state):
        self.computed.append((risk, state))

    def send_set_risk(self, risk, state):
        if self.fail_command:
            raise RuntimeError("falha MQTT simulada")
        self.commands.append((risk, state))


class RiskCalculationTests(unittest.TestCase):
    def test_known_presets(self):
        cases = (
            (Telemetry(24, 101.3, 90, 0.05, 20, 95), 4, "NORMAL"),
            (Telemetry(34, 107.3, 25, 0.8, 65, 55), 44, "ATENCAO"),
            (Telemetry(38, 110, 5, 1.5, 100, 10), 86, "CRITICO"),
        )
        for telemetry, expected_risk, expected_state in cases:
            with self.subTest(expected_state):
                risk = calculate_risk(telemetry)
                self.assertEqual(risk, expected_risk)
                self.assertEqual(state_from_risk(risk), expected_state)

    def test_state_boundaries(self):
        self.assertEqual(state_from_risk(39), "NORMAL")
        self.assertEqual(state_from_risk(40), "ATENCAO")
        self.assertEqual(state_from_risk(69), "ATENCAO")
        self.assertEqual(state_from_risk(70), "CRITICO")

    def test_interpolation_and_rounding_are_deterministic(self):
        telemetry = Telemetry(32.5, 101.3, 90, 0.05, 0, 95)
        self.assertEqual(calculate_risk(telemetry), 8)

    def test_missing_attribute_is_rejected(self):
        entity = entity_for(Telemetry(24, 101.3, 90, 0.05, 20, 95))
        del entity["battery"]
        with self.assertRaisesRegex(ValueError, "Atributo ausente: battery"):
            telemetry_from_entity(entity)

    def test_invalid_range_is_rejected(self):
        entity = entity_for(Telemetry(24, 101.3, 101, 0.05, 20, 95))
        with self.assertRaisesRegex(ValueError, "battery fora da faixa"):
            telemetry_from_entity(entity)


class RiskProcessorTests(unittest.TestCase):
    def test_processes_each_sensor_revision_once(self):
        client = FakeClient(
            entity_for(Telemetry(24, 101.3, 90, 0.05, 20, 95))
        )
        processor = RiskProcessor(client)

        self.assertTrue(processor.process_once())
        self.assertFalse(processor.process_once())
        self.assertEqual(client.computed, [(4, "NORMAL")])
        self.assertEqual(client.commands, [(4, "NORMAL")])

    def test_new_timestamp_triggers_new_calculation(self):
        client = FakeClient(
            entity_for(Telemetry(24, 101.3, 90, 0.05, 20, 95))
        )
        processor = RiskProcessor(client)
        processor.process_once()

        client.entity = entity_for(
            Telemetry(38, 110, 5, 1.5, 100, 10),
            "2026-06-09T15:00:03.000Z",
        )
        self.assertTrue(processor.process_once())
        self.assertEqual(client.computed[-1], (86, "CRITICO"))
        self.assertEqual(client.commands[-1], (86, "CRITICO"))

    def test_failed_command_does_not_mark_revision_as_processed(self):
        client = FakeClient(
            entity_for(Telemetry(24, 101.3, 90, 0.05, 20, 95))
        )
        client.fail_command = True
        processor = RiskProcessor(client)

        with self.assertRaisesRegex(RuntimeError, "falha MQTT simulada"):
            processor.process_once()
        self.assertIsNone(processor.last_revision)

        client.fail_command = False
        self.assertTrue(processor.process_once())
        self.assertEqual(client.commands, [(4, "NORMAL")])


if __name__ == "__main__":
    unittest.main()
