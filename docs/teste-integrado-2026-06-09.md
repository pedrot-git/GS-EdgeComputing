# Teste integrado - 9 de junho de 2026

## Resultado automatizado

- JSON do Wokwi e da colecao Postman validos.
- JavaScript do servidor e frontend sem erro de sintaxe.
- Quatro testes Node aprovados.
- Scripts PowerShell aprovados pelo parser.
- Firmware compilado para `esp32:esp32:esp32`.
- Uso do firmware: 74% de flash e 14% de RAM.

## Provisionamento

`provision-dragon.ps1` foi executado duas vezes seguidas contra
`00.00.000.00`.

Resultado:

- Dispositivo com `setTelemetry` e `setMode`.
- Registration Orion apontando para o IoT Agent.
- Exatamente uma subscription historica Dragon ativa.
- Segunda execucao concluida sem duplicacao.

O IoT Agent possui uma inconsistencia conhecida nesta VM: o service group
existente nao aparece na listagem, mas o POST retorna `DUPLICATE_GROUP`. O
script reconhece esse estado como configuracao existente e continua.

## Comando bidirecional

Foi enviado ao Orion um `setTelemetry` com o preset CRITICO.

Payload observado em `/TEF/dragon001/cmd`:

```text
dragon001@setTelemetry|solarRisk=100|temperature=38|battery=5|pressure=110|vibration=1.5|gpsQuality=10
```

A confirmacao equivalente ao firmware foi publicada em
`/TEF/dragon001/cmdexe`. O Orion registrou:

```text
setTelemetry_status = OK
setTelemetry_info = OK:REMOTE:6_campos
```

## Telemetria e historico

Uma telemetria critica foi publicada pelo topico de atributos. Orion e STH
retornaram:

```text
temperature = 38
pressure = 110
battery = 5
operationalRisk = 86
status = CRITICO
source = REMOTE
```

O ultimo ponto do historico de `operationalRisk` tambem foi `86`.

## Dashboard

- API local respondeu com risco `86` e origem `REMOTE`.
- Ultimo comando exibido com status `OK`.
- Dados com mais de 15 segundos foram marcados como antigos.
- Layout medido em `1280x720` e `390x844`, sem overflow horizontal.
- Console do navegador sem erros ou avisos.

## Pendente de validacao visual

Os arquivos locais do novo Wokwi estao prontos e o firmware compila, mas o
projeto publico ainda precisa ser sincronizado manualmente para validar na
interface do Wokwi os sensores novos, LCD, LEDs, buzzer e rejeicao atomica.
