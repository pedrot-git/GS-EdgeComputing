# Roteiro de demonstracao - Edge Computing

## Cena 1 - Problema

"Operacoes espaciais dependem de telemetria confiavel. Temperatura, pressao,
vibracao, bateria, clima espacial e qualidade de navegacao podem mudar em
poucos segundos e exigem resposta local."

## Cena 2 - Sensores e processamento

"No Wokwi, o ESP32 usa DHT22, BMP180, MPU6050 e um controle de bateria. Ele
envia apenas as leituras. Um servico Python na VM calcula o risco de zero a
cem, registra o resultado no FIWARE e devolve o estado ao ESP32 para LEDs,
buzzer e LCD."

## Cena 3 - Operacao remota

"A equipe em terra pode enviar um preset pelo Postman. O comando passa pelo
Orion e pelo IoT Agent, chega ao ESP32 via MQTT e muda a simulacao para modo
REMOTE. O ESP32 valida todos os campos antes de aplicar e devolve uma
confirmacao ao FIWARE."

Demonstrar:

1. Enviar o preset `CRITICO`.
2. Mostrar `REM CRITICO` no LCD, LED vermelho e buzzer.
3. Consultar `setTelemetry_status=OK` e `setTelemetry_info`.
4. Enviar `Voltar ao modo LOCAL`.

## Cena 4 - Plataforma FIWARE

"A telemetria volta ao Orion pelo mesmo IoT Agent. O processador identifica a
nova leitura, calcula risco e estado, e o STH-Comet guarda separadamente o
historico dos sensores e do resultado. O dashboard apresenta estado atual,
origem dos dados, horario real, alertas e tendencia."

## Cena 5 - Valor e limites

"O principal valor e separar aquisicao, decisao e atuacao. A demonstracao usa
uma VM publica e componentes FIWARE legados por compatibilidade academica. Em
producao, seriam necessarios TLS, autenticacao, alta disponibilidade para o
processador e uma stack NGSI-LD."
