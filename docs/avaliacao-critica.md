# Avaliacao critica do SolarNav Guard

## O que esta bom

- **Edge real:** risco e alertas sao calculados no ESP32, nao apenas no painel.
- **Fluxo completo:** MQTT, IoT Agent, Orion, STH e dashboard tem papeis claros.
- **Bidirecionalidade:** Postman controla a simulacao pelo caminho FIWARE e
  recebe confirmacao de execucao.
- **Demonstracao reproduzivel:** presets reduzem o tempo para apresentar casos.
- **Resiliencia:** a perda de rede nao interrompe leitura e alerta local.
- **Observabilidade:** origem, horario, historico e resultado de comando tornam
  o comportamento explicavel.

## Por que cinco potenciometros nao eram a melhor solucao

Eles eram funcionais para provar entradas analogicas, mas todos os parametros
pareciam o mesmo tipo de sensor, era lento reproduzir um estado exato e
pressao, vibracao e bateria perdiam significado fisico.

O modelo hibrido melhora isso: sensores Wokwi representam grandezas coerentes,
um slider representa bateria e o Postman injeta cenarios controlados. Risco
solar e GPS continuam simulados porque o Wokwi nao oferece uma representacao
fisica convincente para o contexto do projeto.

## Limitacoes atuais

- A VM publica expoe MQTT e APIs sem autenticacao ou criptografia.
- IP e identificadores sao fixos para facilitar a entrega.
- UltraLight e STH-Comet sao tecnologias legadas/arquivadas.
- O dashboard usa polling, nao notificacao em tempo real.
- O modelo de risco e heuristico e nao foi validado com dados aeroespaciais.
- O projeto representa uma unica capsula.
- O MPU6050 simulado nao reproduz vibracao estrutural de alta frequencia.

## Melhorias futuras

### Alta prioridade

- Proteger Orion, IoT Agent, STH e MQTT com firewall, TLS e autenticacao.
- Separar configuracao por ambiente e retirar IP fixo do firmware.
- Adicionar CI para JSON, PowerShell, Node e compilacao Arduino.
- Registrar ID de comando para correlacao inequivoca.

### Media prioridade

- Migrar para NGSI-LD e uma persistencia temporal atual.
- Trocar polling por Server-Sent Events ou WebSocket.
- Adicionar unidades e metadados NGSI aos atributos.
- Persistir eventos de comando e mudancas de modo.

### Evolucao cientifica

- Calibrar pesos e limites com referencias de engenharia.
- Separar risco da capsula e risco de navegacao.
- Usar janelas temporais para vibracao, temperatura e descarga.
- Detectar sensor travado, valor impossivel e mudanca abrupta.

## Conclusao

O projeto e forte como demonstracao academica de Edge + FIWARE. A arquitetura
agora mostra telemetria e atuacao remota, e o hardware ficou mais defensavel.
Na apresentacao, deixe claro que os limites sao didaticos e que a VM nao
representa seguranca de producao.
