# Avaliacao critica do SolarNav Guard

## O que esta bom

- **Regra centralizada:** risco e estado sao calculados por um servico testavel
  na VM, e nao pelo navegador do dashboard.
- **Fluxo completo:** MQTT, IoT Agent, Orion, STH e dashboard tem papeis claros.
- **Bidirecionalidade:** Postman controla a simulacao pelo caminho FIWARE e
  recebe confirmacao de execucao.
- **Demonstracao reproduzivel:** presets reduzem o tempo para apresentar casos.
- **Atuacao distribuida:** a VM decide e o ESP32 aplica o resultado em
  componentes fisicos simulados.
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
- O calculo de risco depende da VM e da conectividade MQTT para chegar aos
  atuadores.
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

O projeto e forte como demonstracao academica de IoT + FIWARE. A arquitetura
agora separa aquisicao, processamento, persistencia e atuacao. Na apresentacao,
deixe claro que os limites sao didaticos e que a VM nao representa seguranca
de producao.
