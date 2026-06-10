# SolarNav Guard - Dragon Telemetry Edge

Projeto de Edge Computing da Global Solution 2026. O SolarNav Guard simula
uma cápsula Dragon no Wokwi, publica telemetria por MQTT, mantém o estado
atual no FIWARE, calcula risco operacional em uma VM e devolve o resultado ao
ESP32 para controlar LCD, LEDs e buzzer.

## Links da entrega

- [Repositório público](https://github.com/pedrot-git/GS-EdgeComputing)
- [Simulação no Wokwi](https://wokwi.com/projects/466370349402539009)
- [Vídeo de demonstração](https://youtu.be/Sl7dUCx1leA)

## Sumário

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Execução rápida](#execução-rápida)
- [Instalação detalhada da VM](#instalação-detalhada-da-vm)
- [Postman](#postman)
- [Dashboard](#dashboard)
- [Wokwi](#wokwi)
- [Validação](#validação)
- [Segurança e limitações](#segurança-e-limitações)
- [Referências](#referências)

## Visão geral

### Integrantes

| Nome | RM |
| --- | --- |
| Giovanna Oliveira Ferreira Dias | 566647 |
| Marianne Mukai Nishikawa | 568001 |
| Maria Laura Pereira Druzeic | 566634 |
| Pedro Henrique Tavares Viana | 567680 |
| David Ernesto Mogollon Gama | 567855 |

### Funcionalidades

- Telemetria com DHT22, BMP180, MPU6050 e controle de bateria.
- Processamento de risco centralizado, testável e executado continuamente na VM.
- Resultado devolvido ao ESP32 para controlar LCD, LEDs e buzzer.
- Controle bidirecional por comandos FIWARE enviados pelo Postman.
- Modos `LOCAL` e `REMOTE`, com confirmação de execução no Orion.
- Estado atual no Orion, histórico no STH-Comet e dashboard responsivo.

### Fluxo de dados

O ESP32 publica os seguintes campos no formato UltraLight:

| Object ID | Atributo FIWARE | Descrição |
| --- | --- | --- |
| `t` | `temperature` | Temperatura interna em °C |
| `p` | `pressure` | Pressão em kPa |
| `b` | `battery` | Bateria em porcentagem |
| `v` | `vibration` | Vibração em g |
| `r` | `solarRisk` | Risco solar de 0 a 100 |
| `g` | `gpsQuality` | Qualidade GPS de 0 a 100 |
| `source` | `source` | Origem `LOCAL` ou `REMOTE` |

Exemplo:

```text
t|24.0|p|101.3|b|90|v|0.05|r|20|g|95|source|LOCAL
```

O Risk Processor consulta novas leituras no Orion, calcula
`operationalRisk` e `status`, atualiza a entidade e envia o comando interno
`setRisk` ao ESP32. Os limites e pesos estão documentados em
[docs/limites-operacionais.md](docs/limites-operacionais.md).

## Arquitetura

![Arquitetura SolarNav Guard](docs/images/arquitetura-solarnav.png?v=20260610-1)

As responsabilidades dos componentes, modos de operação e comandos estão
detalhados em [docs/arquitetura.md](docs/arquitetura.md).

## Execução rápida

### 1. Preparar a VM

Conecte-se a uma VM Ubuntu 22.04 ou 24.04:

```bash
ssh SEU_USUARIO@IP_DA_VM
```

No terminal SSH:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/pedrot-git/GS-EdgeComputing.git
cd GS-EdgeComputing
bash scripts/install-vm.sh
```

O instalador prepara Docker, sobe o FIWARE Descomplicado, provisiona o
dispositivo Dragon e instala o serviço de cálculo de risco.

### 2. Configurar o IP público

Substitua `34.95.247.248` pelo IP da nova VM:

1. Em `wokwi/sketch.ino`, altere `BROKER_MQTT`.
2. No Postman, altere a variável `url`, sem `http://` e sem porta.
3. No dashboard, defina `FIWARE_HOST`.

### 3. Iniciar os clientes

Inicie a simulação pública ou atualize o projeto Wokwi com os arquivos da
pasta `wokwi/`.

Em outro computador, com Node.js 18 ou superior:

```powershell
cd dashboard
node --version
$env:FIWARE_HOST="IP_DA_VM"
npm start
```

Abra `http://localhost:3000` e importe no Postman:

```text
postman/SolarNav-Guard-FIWARE.postman_collection.json
```

## Instalação detalhada da VM

### Requisitos

- Ubuntu Server 22.04 LTS ou 24.04 LTS.
- Pelo menos 1 vCPU, 1 GB de RAM e 20 GB de armazenamento.
- Usuário com permissão para executar `sudo`.
- IP público estático, reservado ou associado a um DNS.
- Acesso SSH pela porta `22/TCP`.

O back-end utiliza o
[FIWARE Descomplicado](https://github.com/fabiocabrini/fiware), de Fabio
Cabrini. O instalador clona o repositório oficial e fixa a revisão utilizada
nos testes, sem duplicar a infraestrutura FIWARE neste projeto.

### Firewall do provedor

As portas publicadas pelos contêineres Docker podem não seguir o
comportamento esperado das regras comuns do UFW. Por isso, configure primeiro
o firewall, security group ou lista de acesso do provedor da VM.

| Porta | Uso | Origem recomendada |
| --- | --- | --- |
| `22/TCP` | SSH | IP/CIDR do administrador |
| `1883/TCP` | MQTT do Wokwi | Internet, somente durante a demonstração |
| `1026/TCP` | Orion e dashboard | IP/CIDR do administrador |
| `4041/TCP` | IoT Agent e Postman | IP/CIDR do administrador |
| `8666/TCP` | Histórico STH-Comet | IP/CIDR do administrador |

Nunca exponha `27017/TCP`. Essa porta pertence ao MongoDB e não é necessária
para Wokwi, Postman ou dashboard.

O UFW pode ser usado como proteção complementar. Substitua
`SEU_IP_PUBLICO/32` pelo endereço autorizado:

```bash
ADMIN_CIDR="SEU_IP_PUBLICO/32"

sudo ufw allow from "$ADMIN_CIDR" to any port 22 proto tcp
sudo ufw allow from "$ADMIN_CIDR" to any port 1026 proto tcp
sudo ufw allow from "$ADMIN_CIDR" to any port 4041 proto tcp
sudo ufw allow from "$ADMIN_CIDR" to any port 8666 proto tcp
sudo ufw allow 1883/tcp
sudo ufw status
```

Não use somente o UFW como barreira para as portas publicadas pelo Docker.

### O que o instalador executa

O comando `bash scripts/install-vm.sh`:

1. Instala Git, cURL, Python, Docker e Docker Compose.
2. Habilita e inicia o Docker.
3. Clona o FIWARE Descomplicado em `~/fiware`.
4. Inicia Orion, IoT Agent MQTT, STH-Comet, MongoDB e Mosquitto.
5. Cria o service group `TEF`.
6. Cria o dispositivo `dragon001`, seus atributos e comandos.
7. Cria a entidade `urn:ngsi-ld:Dragon:001`.
8. Cria duas subscriptions: sensores e risco calculado.
9. Instala e inicia `solarnav-risk.service`.

Para atualizar o projeto ou refazer o provisionamento:

```bash
cd ~/GS-EdgeComputing
git pull
bash scripts/install-vm.sh
```

### Validar a instalação

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

Confira a entidade:

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

Pressione `Ctrl+C` para sair do acompanhamento dos logs.

### Parar e reiniciar

```bash
cd ~/fiware
sudo docker compose down
sudo docker compose up -d
sudo systemctl restart solarnav-risk.service
```

Em instalações antigas, o comando pode ser `docker-compose`.

### Testar as portas no Windows

Execute no computador que utilizará Postman e dashboard:

```powershell
Test-NetConnection IP_DA_VM -Port 1883
Test-NetConnection IP_DA_VM -Port 1026
Test-NetConnection IP_DA_VM -Port 4041
Test-NetConnection IP_DA_VM -Port 8666
```

Se um teste falhar, revise principalmente o firewall externo do provedor.

### Tópicos MQTT

```text
/TEF/dragon001/attrs
/TEF/dragon001/cmd
/TEF/dragon001/cmdexe
```

## Postman

Importe:

```text
postman/SolarNav-Guard-FIWARE.postman_collection.json
```

Antes de executar as requisições, altere a variável `url` da collection para
o IP da VM.

### Instalação automática

Se você executou `scripts/install-vm.sh`, o dispositivo, a entidade e as
subscriptions já foram criados. Use somente:

1. `1 - Healthcheck`
2. `3 - Comandos para o Wokwi`
3. `4 - Consultas`

Não execute novamente a pasta `2 - Provisionamento`, pois suas requisições
manuais não fazem a reconciliação idempotente dos recursos.

### Provisionamento manual

A pasta `2 - Provisionamento` existe para estudo e inspeção das APIs. Execute
as requisições na ordem apresentada somente em uma instalação ainda não
provisionada.

Para refazer a configuração com segurança, prefira:

```bash
bash fiware/provision-dragon.sh
```

No Windows, a alternativa equivalente é:

```powershell
.\fiware\provision-dragon.ps1 -HostName IP_DA_VM
```

### Comandos

`setTelemetry` aceita qualquer subconjunto de:

```text
temperature, pressure, battery, vibration, solarRisk, gpsQuality
```

Ao receber o primeiro comando, o ESP32 copia a leitura local e altera apenas
os campos enviados. Um campo inválido rejeita o comando inteiro. O Postman
não define risco nem status; o Risk Processor calcula ambos.

`setMode=LOCAL` devolve o controle aos sensores. `setRisk` é um comando
interno do processador e não faz parte da operação manual.

## Dashboard

### Requisitos

- Node.js 18 ou superior.
- Acesso às portas `1026` e `8666` da VM.

O dashboard utiliza apenas APIs nativas do Node.js e não possui dependências
externas.

```powershell
cd dashboard
node --version
$env:FIWARE_HOST="IP_DA_VM"
npm start
```

Abra `http://localhost:3000`.

O dashboard usa `TimeInstant`, marca dados com mais de 15 segundos como
antigos e apresenta origem, risco, histórico, alertas e resultado do último
comando.

Para executar os testes:

```powershell
cd dashboard
npm test

cd ..\risk-processor
python -m unittest -v
```

## Wokwi

[Abrir projeto público](https://wokwi.com/projects/466370349402539009)

![Projeto SolarNav Guard no Wokwi](docs/images/wokwi-projeto.png?v=20260609-3)

Para replicar o projeto em outra conta, utilize:

- `wokwi/sketch.ino`
- `wokwi/diagram.json`
- `wokwi/libraries.txt`

Altere `BROKER_MQTT` em `wokwi/sketch.ino` para o IP público da nova VM. O
Wokwi online não acessa `localhost`; o Mosquitto precisa estar acessível em
`1883/TCP`.

### Componentes e controles locais

- DHT22: temperatura.
- BMP180: pressão no barramento I2C `GPIO 21/22`.
- LCD 16x2: compartilha `GPIO 21/22` com o BMP180.
- MPU6050: barramento I2C exclusivo em `GPIO 25/26`.
- Slider: bateria.
- Risco solar local: `20`.
- Qualidade GPS local: `95`.

O ESP32 não calcula risco. Ele publica sensores e usa o último `setRisk`
recebido para atualizar LCD, LEDs e buzzer.

## Validação

A validação local mais recente está registrada em
[docs/validacao-local-2026-06-10.md](docs/validacao-local-2026-06-10.md).

O teste integrado de 9 de junho permanece disponível apenas como registro
histórico em
[docs/teste-integrado-2026-06-09.md](docs/teste-integrado-2026-06-09.md).

## Segurança e limitações

- MQTT e APIs FIWARE estão sem TLS e autenticação.
- A configuração é destinada exclusivamente à demonstração acadêmica.
- Não publique dados sensíveis.
- Restrinja as APIs FIWARE no firewall do provedor.
- Feche `1883/TCP` após a demonstração, se o Wokwi não precisar mais acessar a VM.
- Nunca exponha o MongoDB na porta `27017/TCP`.

Se a VM ou a rede ficar indisponível, o ESP32 continua lendo os sensores, mas
mantém o último risco recebido até o processamento remoto voltar.

O IoT Agent UltraLight está arquivado e o STH-Comet é uma tecnologia legada.
Eles foram mantidos por compatibilidade com a stack acadêmica. Uma evolução
de produção deve considerar IoT Agent JSON, NGSI-LD, TLS, autenticação e
controle de acesso.

## Referências

- [FIWARE Descomplicado](https://github.com/fabiocabrini/fiware)
- [IoT Agent UltraLight MQTT](https://fiware-iotagent-ul.readthedocs.io/en/latest/usermanual.html)
- [Orion Context Broker](https://fiware-orion.readthedocs.io/)
- [Wokwi Supported Hardware](https://docs.wokwi.com/getting-started/supported-hardware)
