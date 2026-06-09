# Arquitetura - SolarNav Guard Dragon Telemetry

![Diagrama completo da arquitetura SolarNav Guard](images/arquitetura-solarnav.png)

## Responsabilidades

- **ESP32/Wokwi:** le sensores, escolhe modo LOCAL/REMOTE, valida comandos,
  calcula risco e aciona LEDs, buzzer e LCD.
- **IoT Agent MQTT:** converte UltraLight em NGSI-v2 e encaminha comandos.
- **Orion:** concentra telemetria atual e estado dos comandos.
- **STH-Comet:** armazena o historico dos atributos de telemetria.
- **Dashboard:** apresenta estado, origem, frescor, historico e alertas.
- **Postman:** envia comandos e consulta resultados sem escrever risco/status.

## Identificadores

- Service: `smart`
- Service path: `/`
- API key: `TEF`
- Device ID: `dragon001`
- Entity ID: `urn:ngsi-ld:Dragon:001`
- Entity type: `DragonTelemetry`

## Modos

Em `LOCAL`, temperatura, pressao, vibracao e bateria vem dos componentes
Wokwi. Risco solar vale `20` e GPS vale `95`.

Em `REMOTE`, `setTelemetry` copia a ultima leitura local e aplica somente os
campos recebidos. A validacao e atomica: um campo invalido rejeita tudo.
`setMode=LOCAL` devolve o controle aos sensores.

## Comandos

| Comando | Valor | Efeito |
| --- | --- | --- |
| `setTelemetry` | Objeto parcial | Ativa REMOTE e altera os campos enviados |
| `setMode` | `LOCAL` | Retorna aos sensores |

O IoT Agent publica em `/TEF/dragon001/cmd`. O ESP32 confirma em
`/TEF/dragon001/cmdexe`, gerando `<comando>_status` e `<comando>_info`.

## Falhas

- Sem Wi-Fi/MQTT, o ESP32 continua lendo sensores e acionando alertas.
- Sem Orion, o dashboard mostra indisponibilidade.
- Com `TimeInstant` mais antigo que 15 segundos, mostra `Dados antigos`.
- Com comando invalido, o ESP32 preserva o estado anterior e responde `ERROR`.
