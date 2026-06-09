#include <WiFi.h>
#include <PubSubClient.h>
#include <DHTesp.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_BMP085.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <Wire.h>
#include <math.h>

// SolarNav Guard - Dragon Telemetry
const char* SSID = "Wokwi-GUEST";
const char* PASSWORD = "";
const char* BROKER_MQTT = "00.00.000.00";
const int BROKER_PORT = 1883;

const char* TOPIC_TELEMETRY = "/TEF/dragon001/attrs";
const char* TOPIC_COMMANDS = "/TEF/dragon001/cmd";
const char* TOPIC_COMMAND_RESULT = "/TEF/dragon001/cmdexe";
const char* DEVICE_ID = "dragon001";
const char* CLIENT_ID = "solarnav_dragon001";

const int PIN_DHT = 15;
const int PIN_BATTERY = 34;
const int LED_GREEN = 18;
const int LED_YELLOW = 19;
const int LED_RED = 5;
const int BUZZER = 23;

const unsigned long SENSOR_INTERVAL_MS = 500;
const unsigned long PUBLISH_INTERVAL_MS = 3000;
const unsigned long WIFI_RETRY_MS = 10000;
const unsigned long MQTT_RETRY_MS = 5000;

struct Telemetry {
  float temperature;
  float pressure;
  int battery;
  float vibration;
  int solarRisk;
  int gpsQuality;
};

WiFiClient espClient;
PubSubClient mqtt(espClient);
DHTesp dht;
LiquidCrystal_I2C lcd(0x27, 16, 2);
Adafruit_BMP085 bmp;
Adafruit_MPU6050 mpu;

Telemetry localTelemetry = {24.0, 101.3, 90, 0.0, 20, 95};
Telemetry remoteTelemetry = localTelemetry;
bool remoteMode = false;
bool bmpReady = false;
bool mpuReady = false;

unsigned long lastSensorRead = 0;
unsigned long lastPublish = 0;
unsigned long lastWiFiAttempt = 0;
unsigned long lastMqttAttempt = 0;

float mapFloat(int value, float outMin, float outMax) {
  return outMin + (outMax - outMin) * (float)value / 4095.0;
}

int scoreHigh(float value, float warn, float critical) {
  if (value <= warn) return 0;
  if (value >= critical) return 100;
  return (int)(((value - warn) / (critical - warn)) * 100.0);
}

int scoreLow(float value, float warn, float critical) {
  if (value >= warn) return 0;
  if (value <= critical) return 100;
  return (int)(((warn - value) / (warn - critical)) * 100.0);
}

int scorePressure(float pressure) {
  float deviation = fabs(pressure - 101.3);
  return scoreHigh(deviation, 4.0, 10.0);
}

int calculateRisk(const Telemetry& data) {
  int tempRisk = max(
    scoreHigh(data.temperature, 29.0, 36.0),
    scoreLow(data.temperature, 18.0, 12.0)
  );
  int pressureRisk = scorePressure(data.pressure);
  int batteryRisk = scoreLow(data.battery, 45.0, 15.0);
  int vibrationRisk = scoreHigh(data.vibration, 1.1, 2.3);
  int gpsRisk = scoreLow(data.gpsQuality, 65.0, 30.0);

  float weighted =
    tempRisk * 0.15 +
    pressureRisk * 0.20 +
    batteryRisk * 0.15 +
    vibrationRisk * 0.15 +
    data.solarRisk * 0.20 +
    gpsRisk * 0.15;

  return constrain((int)round(weighted), 0, 100);
}

String stateFromRisk(int risk) {
  if (risk >= 70) return "CRITICO";
  if (risk >= 40) return "ATENCAO";
  return "NORMAL";
}

void printLcdLine(int row, String text) {
  while (text.length() < 16) text += " ";
  if (text.length() > 16) text = text.substring(0, 16);
  lcd.setCursor(0, row);
  lcd.print(text);
}

void updateActuators(int risk, const String& state) {
  digitalWrite(LED_GREEN, state == "NORMAL");
  digitalWrite(LED_YELLOW, state == "ATENCAO");
  digitalWrite(LED_RED, state == "CRITICO");

  if (state == "CRITICO") {
    tone(BUZZER, 1800, 250);
  } else {
    noTone(BUZZER);
  }

  printLcdLine(0, String(remoteMode ? "REM " : "LOC ") + state);
  printLcdLine(1, "Risco " + String(risk) + "/100");
}

void readLocalSensors() {
  TempAndHumidity dhtData = dht.getTempAndHumidity();
  if (!isnan(dhtData.temperature)) {
    localTelemetry.temperature = dhtData.temperature;
  }

  if (bmpReady) {
    localTelemetry.pressure = bmp.readPressure() / 1000.0;
  }

  localTelemetry.battery = map(analogRead(PIN_BATTERY), 0, 4095, 0, 100);

  if (mpuReady) {
    sensors_event_t acceleration;
    sensors_event_t gyro;
    sensors_event_t mpuTemperature;
    mpu.getEvent(&acceleration, &gyro, &mpuTemperature);
    float magnitude = sqrt(
      acceleration.acceleration.x * acceleration.acceleration.x +
      acceleration.acceleration.y * acceleration.acceleration.y +
      acceleration.acceleration.z * acceleration.acceleration.z
    ) / SENSORS_GRAVITY_STANDARD;
    localTelemetry.vibration = fabs(magnitude - 1.0);
  }

  localTelemetry.solarRisk = 20;
  localTelemetry.gpsQuality = 95;
}

bool parseStrictFloat(const String& text, float& value) {
  if (text.length() == 0) return false;
  char* end = nullptr;
  value = strtof(text.c_str(), &end);
  return end != text.c_str() && *end == '\0' && isfinite(value);
}

bool validateField(const String& key, float value) {
  if (key == "temperature") return value >= -40.0 && value <= 85.0;
  if (key == "pressure") return value >= 88.0 && value <= 112.0;
  if (key == "battery") return value >= 0.0 && value <= 100.0 && floor(value) == value;
  if (key == "vibration") return value >= 0.0 && value <= 3.0;
  if (key == "solarRisk") return value >= 0.0 && value <= 100.0 && floor(value) == value;
  if (key == "gpsQuality") return value >= 0.0 && value <= 100.0 && floor(value) == value;
  return false;
}

void setField(Telemetry& data, const String& key, float value) {
  if (key == "temperature") data.temperature = value;
  else if (key == "pressure") data.pressure = value;
  else if (key == "battery") data.battery = (int)value;
  else if (key == "vibration") data.vibration = value;
  else if (key == "solarRisk") data.solarRisk = (int)value;
  else if (key == "gpsQuality") data.gpsQuality = (int)value;
}

void sendCommandResult(const String& command, const String& result) {
  String payload = String(DEVICE_ID) + "@" + command + "|" + result;
  bool published = mqtt.publish(TOPIC_COMMAND_RESULT, payload.c_str());
  Serial.print(published ? "Confirmacao enviada: " : "Falha ao confirmar: ");
  Serial.println(payload);
}

void handleSetTelemetry(const String& value) {
  Telemetry candidate = remoteMode ? remoteTelemetry : localTelemetry;
  int start = 0;
  int changed = 0;

  while (start <= value.length()) {
    int separator = value.indexOf('|', start);
    String pair = separator < 0 ? value.substring(start) : value.substring(start, separator);
    int equals = pair.indexOf('=');

    if (equals <= 0) {
      sendCommandResult("setTelemetry", "ERROR:formato_invalido");
      return;
    }

    String key = pair.substring(0, equals);
    String rawValue = pair.substring(equals + 1);
    float parsedValue;
    if (!parseStrictFloat(rawValue, parsedValue) || !validateField(key, parsedValue)) {
      sendCommandResult("setTelemetry", "ERROR:campo_invalido:" + key);
      return;
    }

    setField(candidate, key, parsedValue);
    changed++;
    if (separator < 0) break;
    start = separator + 1;
  }

  if (changed == 0) {
    sendCommandResult("setTelemetry", "ERROR:sem_campos");
    return;
  }

  remoteTelemetry = candidate;
  remoteMode = true;
  sendCommandResult("setTelemetry", "OK:REMOTE:" + String(changed) + "_campos");
  lastPublish = 0;
}

void handleSetMode(String value) {
  value.trim();
  value.toUpperCase();
  if (value != "LOCAL") {
    sendCommandResult("setMode", "ERROR:modo_deve_ser_LOCAL");
    return;
  }

  remoteMode = false;
  sendCommandResult("setMode", "OK:LOCAL");
  lastPublish = 0;
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message;
  message.reserve(length);
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  Serial.print("Comando recebido: ");
  Serial.println(message);

  String prefix = String(DEVICE_ID) + "@";
  if (!message.startsWith(prefix)) {
    Serial.println("Comando ignorado: dispositivo incorreto.");
    return;
  }

  int separator = message.indexOf('|');
  if (separator < 0) {
    Serial.println("Comando ignorado: formato invalido.");
    return;
  }

  String command = message.substring(prefix.length(), separator);
  String value = message.substring(separator + 1);

  if (command == "setTelemetry") {
    handleSetTelemetry(value);
  } else if (command == "setMode") {
    handleSetMode(value);
  } else {
    sendCommandResult(command, "ERROR:comando_desconhecido");
  }
}

void maintainWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  unsigned long now = millis();
  if (now - lastWiFiAttempt < WIFI_RETRY_MS) return;

  lastWiFiAttempt = now;
  Serial.println("Tentando conectar ao WiFi...");
  WiFi.begin(SSID, PASSWORD);
}

void maintainMqtt() {
  if (WiFi.status() != WL_CONNECTED || mqtt.connected()) return;
  unsigned long now = millis();
  if (now - lastMqttAttempt < MQTT_RETRY_MS) return;

  lastMqttAttempt = now;
  Serial.print("Tentando conectar ao MQTT em ");
  Serial.println(BROKER_MQTT);

  if (mqtt.connect(CLIENT_ID)) {
    mqtt.subscribe(TOPIC_COMMANDS);
    Serial.print("MQTT conectado e inscrito em ");
    Serial.println(TOPIC_COMMANDS);
  } else {
    Serial.print("Falha MQTT, rc=");
    Serial.println(mqtt.state());
  }
}

void publishTelemetry(const Telemetry& data, int risk, const String& state) {
  String payload =
    "t|" + String(data.temperature, 1) +
    "|p|" + String(data.pressure, 1) +
    "|b|" + String(data.battery) +
    "|v|" + String(data.vibration, 2) +
    "|r|" + String(data.solarRisk) +
    "|g|" + String(data.gpsQuality) +
    "|risk|" + String(risk) +
    "|state|" + state +
    "|source|" + String(remoteMode ? "REMOTE" : "LOCAL");

  bool published = mqtt.connected() && mqtt.publish(TOPIC_TELEMETRY, payload.c_str());
  Serial.print(published ? "Publicado: " : "Telemetria local, sem publicacao: ");
  Serial.println(payload);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(PIN_BATTERY, INPUT);

  Wire.begin(21, 22);
  dht.setup(PIN_DHT, DHTesp::DHT22);
  bmpReady = bmp.begin();
  mpuReady = mpu.begin();
  if (mpuReady) {
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  lcd.init();
  lcd.backlight();
  printLcdLine(0, "SolarNav Guard");
  printLcdLine(1, "Edge iniciando");

  WiFi.mode(WIFI_STA);
  mqtt.setServer(BROKER_MQTT, BROKER_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);

  lastWiFiAttempt = millis() - WIFI_RETRY_MS;
  readLocalSensors();
}

void loop() {
  maintainWiFi();
  maintainMqtt();
  mqtt.loop();

  unsigned long now = millis();
  if (now - lastSensorRead >= SENSOR_INTERVAL_MS) {
    lastSensorRead = now;
    readLocalSensors();
  }

  const Telemetry& active = remoteMode ? remoteTelemetry : localTelemetry;
  int risk = calculateRisk(active);
  String state = stateFromRisk(risk);
  updateActuators(risk, state);

  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    lastPublish = now;
    publishTelemetry(active, risk, state);
  }
}
