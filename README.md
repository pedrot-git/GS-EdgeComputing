# SolarNav Guard - Dragon Telemetry Edge

Projeto de Edge Computing da Global Solution 2026. O sistema simula uma
capsula Dragon, envia sensores pelo ESP32 e calcula risco operacional em um
servico Python na VM, integrando Wokwi, MQTT, FIWARE, STH-Comet, Postman e
dashboard web.

## Integrantes

| Nome | RM |
| --- | --- |
| Giovanna Oliveira Ferreira Dias | 566647 |
| Marianne Mukai Nishikawa | 568001 |
| Maria Laura Pereira Druzeic | 566634 |
| Pedro Henrique Tavares Viana | 567680 |
| David Ernesto Mogollon Gama | 567855 |

## Diferenciais

- Telemetria local com DHT22, BMP180, MPU6050 e controle de bateria.
- Calculo de risco centralizado, testavel e executado continuamente na VM.
- Resultado devolvido ao ESP32 para controlar LEDs, buzzer e LCD.
- Controle bidirecional pelo Postman usando comandos FIWARE.
- Modos `LOCAL` e `REMOTE`, com confirmacao de comando no Orion.
- Estado atual no Orion, historico no STH-Comet e dashboard responsivo.

## Arquitetura

Mais detalhes em [docs/arquitetura.md](docs/arquitetura.md).

## Telemetria

| Object ID | Atributo FIWARE | Descricao |
| --- | --- | --- |
| `t` | `temperature` | Temperatura interna em C |
| `p` | `pressure` | Pressao em kPa |
| `b` | `battery` | Bateria em porcentagem |
| `v` | `vibration` | Vibracao em g |
| `r` | `solarRisk` | Risco solar de 0 a 100 |
| `g` | `gpsQuality` | Qualidade GPS de 0 a 100 |
| `source` | `source` | `LOCAL` ou `REMOTE` |

Payload UltraLight:

```text
t|24.0|p|101.3|b|90|v|0.05|r|20|g|95|source|LOCAL
```

O processador da VM grava `operationalRisk` e `status` diretamente no Orion e
envia `setRisk` ao ESP32 para atualizar os atuadores.

Os limites e pesos oficiais estao em
[docs/limites-operacionais.md](docs/limites-operacionais.md).

## Subir e provisionar o FIWARE

Suba o stack do
[FIWARE Descomplicado](https://github.com/fabiocabrini/fiware) e execute:

```powershell
.\fiware\healthcheck.ps1 -HostName 34.95.247.248
.\fiware\provision-dragon.ps1 -HostName 34.95.247.248
.\scripts\deploy-risk-processor.ps1 -HostName 34.95.247.248
```

O provisionamento remove configuracoes antigas deste dispositivo, recria
service group, dispositivo, comandos, entidade e cria duas subscriptions:
sensores e risco calculado. O ultimo comando instala e inicia
`solarnav-risk.service` na VM.

Para conferir o servico no SSH da VM:

```bash
sudo systemctl status solarnav-risk.service
sudo journalctl -u solarnav-risk.service -f
```

Topicos:

```text
/TEF/dragon001/attrs
/TEF/dragon001/cmd
/TEF/dragon001/cmdexe
```

## Usar o Postman

Importe:

```text
postman/SolarNav-Guard-FIWARE.postman_collection.json
```

Fluxo recomendado:

1. Execute `1 - Healthcheck`.
2. Rode o script idempotente de provisionamento.
3. Inicie a simulacao Wokwi.
4. Envie um preset em `3 - Comandos para o Wokwi`.
5. Consulte `Resultado do ultimo comando`.

`setTelemetry` aceita qualquer subconjunto de:

```text
temperature, pressure, battery, vibration, solarRisk, gpsQuality
```

Ao receber o primeiro comando, o ESP32 copia a leitura local e altera apenas
os campos enviados. Um campo invalido rejeita o comando inteiro. O Postman nao
define risco nem status; o processador da VM calcula ambos.

`Voltar ao modo LOCAL` devolve o controle aos sensores.

## Rodar o dashboard

```powershell
cd dashboard
$env:FIWARE_HOST="34.95.247.248"
npm start
```

Abra `http://localhost:3000`.

O dashboard usa `TimeInstant`, marca dados com mais de 15 segundos como
antigos, mostra a origem e o resultado do ultimo comando.

Testes:

```powershell
cd dashboard
npm test

cd ..\risk-processor
python -m unittest -v
```

O registro da validacao executada esta em
[docs/teste-integrado-2026-06-09.md](docs/teste-integrado-2026-06-09.md).

## Usar no Wokwi

Projeto publico atual:

https://wokwi.com/projects/466370349402539009

![Projeto SolarNav Guard no Wokwi](docs/images/wokwi-projeto.png?v=20260609-2)

Atualize o projeto publico com:

- `wokwi/sketch.ino`
- `wokwi/diagram.json`
- `wokwi/libraries.txt`

O broker configurado e `34.95.247.248:1883`. O Wokwi online nao acessa
`localhost`, portanto o Mosquitto precisa estar publicamente acessivel.

Controles locais:

- DHT22: temperatura.
- BMP180: pressao, usando I2C em `GPIO 21/22`.
- LCD I2C: compartilha o barramento `GPIO 21/22` com o BMP180.
- MPU6050: barramento I2C exclusivo em `GPIO 25/26`.
- Slider: bateria.
- Risco solar local: `20`.
- Qualidade GPS local: `95`.

O ESP32 nao calcula risco. Ele publica os sensores, recebe `setRisk` da VM e
usa o resultado somente para LEDs, buzzer e LCD.

## Seguranca e evolucao

A VM usa MQTT e APIs FIWARE publicas sem TLS ou autenticacao. Isso e aceitavel
somente para demonstracao academica. Nao envie dados sensiveis.

Se a VM ou a rede ficar indisponivel, o ESP32 continua lendo sensores, mas
mantem o ultimo risco recebido ate o processamento remoto voltar.

O IoT Agent UltraLight esta arquivado e o STH-Comet e uma tecnologia legada.
Eles foram mantidos por compatibilidade com a stack exigida. Uma evolucao de
producao deve avaliar IoT Agent JSON, NGSI-LD, TLS e controle de acesso.

Veja [docs/avaliacao-critica.md](docs/avaliacao-critica.md).

## Links da entrega

- GitHub publico: https://github.com/pedrot-git/GS-EdgeComputing
- Wokwi publico: https://wokwi.com/projects/466370349402539009
- Video no YouTube: https://youtu.be/y4Co_naWWIw

## Referencias

- [FIWARE Descomplicado](https://github.com/fabiocabrini/fiware)
- [IoT Agent UltraLight MQTT](https://fiware-iotagent-ul.readthedocs.io/en/latest/usermanual.html)
- [Orion Context Broker](https://fiware-orion.readthedocs.io/)
- [Wokwi Supported Hardware](https://docs.wokwi.com/getting-started/supported-hardware)
