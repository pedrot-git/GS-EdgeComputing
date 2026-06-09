# Atendimento aos criterios da GS

| Criterio | Implementacao |
| --- | --- |
| Telemetria da capsula Dragon | Entidade `DragonTelemetry` com seis parametros, risco, estado e origem |
| Transmissao MQTT | Topicos de atributos, comandos e confirmacoes UltraLight |
| FIWARE como back-end | IoT Agent MQTT, Orion e STH-Comet |
| Dashboard dinamico | Estado atual, frescor, origem, comandos e alertas |
| Historico em graficos | Consulta STH com atributo selecionavel e horario |
| Triggers de anomalia | LEDs, buzzer, LCD e lista de alertas |
| Pelo menos 3 parametros | Temperatura, pressao, bateria, vibracao, solar e GPS |
| Atuacao remota | Presets Postman enviados pelo fluxo oficial FIWARE |
| Edge resiliente | Calculo e atuadores continuam funcionando sem MQTT |
| Storytelling | Roteiro em `docs/storytelling-edge.md` |

## Evidencias recomendadas

1. Wokwi em modo LOCAL com os sensores identificados.
2. Postman enviando o preset CRITICO.
3. LCD exibindo `REM CRITICO`, LED vermelho e buzzer.
4. Orion com `setTelemetry_status=OK`.
5. Dashboard exibindo origem REMOTE e historico.
6. Retorno ao modo LOCAL.
7. Provisionamento executado duas vezes com uma unica subscription.
