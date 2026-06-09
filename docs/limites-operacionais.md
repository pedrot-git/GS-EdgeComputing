# Limites operacionais

Esta e a fonte de verdade para firmware, dashboard, presets e demonstracao.

## Risco por parametro

| Parametro | Sem risco ate | Risco maximo em | Peso |
| --- | ---: | ---: | ---: |
| Temperatura alta | 29 C | 36 C | 15% |
| Temperatura baixa | 18 C | 12 C | 15% |
| Desvio de pressao de 101,3 kPa | 4 kPa | 10 kPa | 20% |
| Bateria baixa | 45% | 15% | 15% |
| Vibracao alta | 1,1 g | 2,3 g | 15% |
| Risco solar | 0 | 100 | 20% |
| GPS baixo | 65% | 30% | 15% |

Temperatura usa o maior risco entre alta e baixa. Cada risco intermediario e
interpolado linearmente. O resultado final e a soma ponderada, arredondada e
limitada entre 0 e 100.

## Estados

| Risco | Estado |
| ---: | --- |
| 0 a 39 | `NORMAL` |
| 40 a 69 | `ATENCAO` |
| 70 a 100 | `CRITICO` |

## Faixas aceitas por comando

| Campo | Faixa |
| --- | --- |
| `temperature` | -40 a 85 C |
| `pressure` | 88 a 112 kPa |
| `battery` | inteiro de 0 a 100 |
| `vibration` | 0 a 3 g |
| `solarRisk` | inteiro de 0 a 100 |
| `gpsQuality` | inteiro de 0 a 100 |

O dashboard abre alertas preventivos nos mesmos pontos em que o risco de cada
sensor comeca. Para risco solar, o destaque visual ocorre acima de 70.
