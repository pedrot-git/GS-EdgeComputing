# Validação local - 10 de junho de 2026

Esta validação confirma a integridade local do código, dos testes e dos
arquivos de configuração após a revisão profissional do README.

## Ambiente

- Windows com PowerShell.
- Node.js `v24.14.1`.
- npm `11.11.0`.
- Python `3.13.5`.
- Git Bash `5.2.37`.

O dashboard declara compatibilidade com Node.js 18 ou superior.

## Testes automatizados

### Dashboard

Comando:

```powershell
cd dashboard
npm.cmd test
```

Resultado:

- 4 testes executados.
- 4 testes aprovados.
- Nenhuma falha.

Os testes cobrem atributos permitidos no histórico, rejeição de atributos
inválidos, bloqueio de métodos de escrita e proteção contra path traversal.

### Risk Processor

Comando:

```powershell
cd risk-processor
python -m unittest test_risk_processor.py
```

Resultado:

- 8 testes executados.
- 8 testes aprovados.
- Nenhuma falha.

Os testes cobrem cálculo de risco, limites de estado, arredondamento,
validação da telemetria e comportamento do processamento.

## Verificações estáticas

Foram concluídas sem erro:

- Sintaxe de `dashboard/server.js`.
- Sintaxe de `dashboard/public/app.js`.
- Sintaxe de `scripts/install-vm.sh`.
- Sintaxe de `fiware/provision-dragon.sh`.
- Sintaxe de `risk-processor/install.sh`.
- Parse de `wokwi/diagram.json`.
- Parse da collection Postman.

O provisionamento atual declara os três comandos esperados:

- `setTelemetry`
- `setMode`
- `setRisk`

Também declara exatamente duas subscriptions:

- `SolarNav Guard Dragon sensor history`
- `SolarNav Guard Dragon risk history`

## Documentação e segurança

O README foi verificado para confirmar:

- Node.js 18 ou superior como requisito do dashboard.
- APIs FIWARE restritas ao IP/CIDR autorizado.
- MQTT público somente durante a demonstração.
- Ausência de recomendação para expor a porta `27017/TCP`.
- Distinção entre instalação automática e provisionamento manual no Postman.

## Limites desta validação

Esta execução foi local. Não foram repetidos em 10 de junho de 2026:

- A instalação completa em uma VM Ubuntu nova.
- A aplicação das regras no firewall de um provedor de nuvem.
- O fluxo público Wokwi → MQTT → FIWARE.
- A validação visual do dashboard contra uma VM recém-instalada.

O teste integrado de 9 de junho permanece como registro histórico do fluxo
executado contra a VM utilizada na entrega.
