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

![Arquitetura SolarNav Guard](docs/images/arquitetura-solarnav.png?v=20260610-1)

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

## Preparar a VM pelo SSH

O back-end utiliza o
[FIWARE Descomplicado](https://github.com/fabiocabrini/fiware), de Fabio
Cabrini. O projeto nao duplica os arquivos dessa ferramenta: o instalador
clona o repositorio oficial e fixa a revisao utilizada nos testes.

### Requisitos da VM

- Ubuntu Server 22.04 LTS ou 24.04 LTS.
- Pelo menos 1 vCPU, 1 GB de RAM e 20 GB de armazenamento.
- Usuario com permissao para executar `sudo`.
- IP publico estatico, reservado ou DNS apontando para a VM.
- Acesso SSH pela porta `22/TCP`.

### Regras de firewall

Crie as regras no firewall do provedor de nuvem antes de iniciar o Wokwi:

| Porta | Uso | Origem recomendada |
| --- | --- | --- |
| `22/TCP` | SSH | Apenas o IP do administrador |
| `1883/TCP` | MQTT do Wokwi | Internet, somente para a demonstracao |
| `1026/TCP` | Orion e dashboard | Apenas os IPs que usarao o projeto |
| `4041/TCP` | IoT Agent e Postman | Apenas os IPs que usarao o projeto |
| `8666/TCP` | Historico STH-Comet | Apenas os IPs que usarao o projeto |

Nao libere `27017/TCP`. Essa porta pertence ao MongoDB e nao e necessaria para
o Wokwi, dashboard ou Postman. A stack e adequada para uma demonstracao
academica e nao possui autenticacao ou TLS.

Se o UFW estiver ativo na VM, libere tambem as portas no Ubuntu:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 1883/tcp
sudo ufw allow 1026/tcp
sudo ufw allow 4041/tcp
sudo ufw allow 8666/tcp
sudo ufw status
```

### Instalacao completa

Entre na VM:

```bash
ssh SEU_USUARIO@IP_DA_VM
```

No terminal SSH, clone este repositorio e execute o instalador:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/pedrot-git/GS-EdgeComputing.git
cd GS-EdgeComputing
bash scripts/install-vm.sh
```

O script executa automaticamente:

1. Instala Git, cURL, Python, Docker e Docker Compose.
2. Habilita e inicia o Docker.
3. Clona o FIWARE Descomplicado em `~/fiware`.
4. Inicia Orion, IoT Agent MQTT, STH-Comet, MongoDB e Mosquitto.
5. Cria o service group `TEF`.
6. Cria o dispositivo `dragon001`, seus atributos e comandos.
7. Cria a entidade `urn:ngsi-ld:Dragon:001`.
8. Cria as subscriptions de sensores e risco para o STH-Comet.
9. Instala e inicia o servico `solarnav-risk.service`.

O provisionamento e repetivel. Para atualizar o projeto ou refazer a
configuracao:

```bash
cd ~/GS-EdgeComputing
git pull
bash scripts/install-vm.sh
```

### Validar na VM

Confira os contêineres:

```bash
sudo docker ps
```

Confira os componentes FIWARE:

```bash
curl http://localhost:1026/version
curl http://localhost:4041/iot/about
curl http://localhost:8666/version
```

Confira a entidade criada:

```bash
curl \
  -H "fiware-service: smart" \
  -H "fiware-servicepath: /" \
  http://localhost:1026/v2/entities/urn:ngsi-ld:Dragon:001
```

Confira o processador de risco:

```bash
sudo systemctl status solarnav-risk.service
sudo journalctl -u solarnav-risk.service -f
```

Para sair do acompanhamento dos logs, pressione `Ctrl+C`.

### Parar e reiniciar

```bash
cd ~/fiware
sudo docker compose down
sudo docker compose up -d
sudo systemctl restart solarnav-risk.service
```

Se a VM usar a versao antiga do Compose, substitua `docker compose` por
`docker-compose`.

### Configurar o IP da nova VM

Depois da instalacao, anote o IP publico da VM. Ele deve substituir
`34.95.247.248` nos seguintes pontos:

1. No Wokwi, abra `sketch.ino` e altere:

```cpp
const char* BROKER_MQTT = "IP_DA_VM";
```

2. No Postman, abra a collection importada, acesse `Variables` e altere a
   variavel `url` para o IP da VM, sem `http://` e sem porta.
3. Para executar o dashboard em outro computador, informe o mesmo IP na
   variavel `FIWARE_HOST`.

No Windows, teste as portas a partir do computador que executara o Postman e
o dashboard:

```powershell
Test-NetConnection IP_DA_VM -Port 1883
Test-NetConnection IP_DA_VM -Port 1026
Test-NetConnection IP_DA_VM -Port 4041
Test-NetConnection IP_DA_VM -Port 8666
```

Se um teste falhar, revise a regra de firewall do provedor da VM. Abrir a porta
somente no Ubuntu pode nao ser suficiente, pois os provedores de nuvem possuem
um firewall externo proprio.

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
$env:FIWARE_HOST="IP_DA_VM"
npm install
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

![Projeto SolarNav Guard no Wokwi](docs/images/wokwi-projeto.png?v=20260609-3)

Atualize o projeto publico com:

- `wokwi/sketch.ino`
- `wokwi/diagram.json`
- `wokwi/libraries.txt`

O projeto publico usa a VM da demonstracao. Para replicar em outra VM, altere
`BROKER_MQTT` em `wokwi/sketch.ino` para o novo IP publico. O Wokwi online nao
acessa `localhost`, portanto o Mosquitto precisa estar publicamente acessivel
na porta `1883/TCP`.

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

## Links da entrega

- GitHub publico: https://github.com/pedrot-git/GS-EdgeComputing
- Wokwi publico: https://wokwi.com/projects/466370349402539009
- Video no YouTube: https://youtu.be/Sl7dUCx1leA

## Referencias

- [FIWARE Descomplicado](https://github.com/fabiocabrini/fiware)
- [IoT Agent UltraLight MQTT](https://fiware-iotagent-ul.readthedocs.io/en/latest/usermanual.html)
- [Orion Context Broker](https://fiware-orion.readthedocs.io/)
- [Wokwi Supported Hardware](https://docs.wokwi.com/getting-started/supported-hardware)
