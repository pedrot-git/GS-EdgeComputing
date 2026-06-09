# Teste manual integrado - 8 de junho de 2026

> Registro historico da versao com cinco potenciometros. A revisao hibrida e
> bidirecional esta documentada em `teste-integrado-2026-06-09.md`.

## Resultado

Fluxo validado:

`Wokwi/ESP32 -> MQTT -> IoT Agent -> Orion -> STH-Comet -> Dashboard`

O projeto Wokwi compilou, conectou ao Wi-Fi, publicou na VM e atualizou o
dashboard. Projeto publico:

https://wokwi.com/projects/466306185057884161

## Cenarios Wokwi

| Estado | Pressao | Bateria | Vibracao | Solar | GPS | Risco |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| NORMAL | 101.3 | 87 | 0 | 0 | 100 | 0 |
| ATENCAO | 101.3 | 0 | 3 | 100 | 100 | 50 |
| CRITICO | 112 | 0 | 3 | 100 | 0 | 85 |

Os estados foram confirmados no LCD, nos LEDs e na entidade
`urn:ngsi-ld:Dragon:001`. No estado critico, o firmware executa o comando
`tone()` do buzzer.

## FIWARE e dashboard

- Orion, IoT Agent, STH-Comet e consulta de service groups responderam `OK`.
- A assinatura Orion -> STH permaneceu ativa, sem falha e com HTTP 200.
- Os tres estados apareceram no historico de `operationalRisk`.
- Os oito cards, sete seletores de historico e triggers foram validados.
- A atualizacao automatica ocorreu sem recarregar a pagina.
- Layout validado em `1280x720` e `390x844`, sem overflow horizontal.
- Com FIWARE indisponivel, o dashboard exibiu `Sem dados` e a orientacao esperada.

## Evidencias

- `screenshots/wokwi-normal.png`
- `screenshots/wokwi-atencao.png`
- `screenshots/wokwi-critico.png`
- `screenshots/dashboard-normal.png`
- `screenshots/dashboard-critico.png`
- `screenshots/dashboard-sem-fiware.png`

O painel do Serial Monitor foi configurado para abrir sempre, mas o texto nao
foi renderizado de forma legivel na captura automatizada. A publicacao MQTT foi
confirmada diretamente pelos novos timestamps e valores recebidos no Orion e
no STH-Comet.
