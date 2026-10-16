# Performance, latência, status e volume por rota

O agregador e validador de artefatos estão implementados; a instrumentação HTTP permanece planejada. Veja [o contrato executável](13-esteiras-executaveis.md). A API não existe nesta etapa; não há medidas, baseline nem SLA aprovados. Inventário inicial em [performance/rotas.md](performance/rotas.md). Coletar dados dentro dos testes de integração autorizados, sem criar suíte independente de benchmark/carga.

## Unidade de observação

Uma amostra por requisição, identificada por execução, método, template da rota, cenário e status HTTP real. Usar `/api/v1/orders/:id`, sem UUIDs concretos ou query strings nas dimensões. Diferenciar lista vazia, páginas com diferentes quantidades de itens, filtros, cache hit/miss/bypass, primário/réplica e perfil simples/escalado. Não misturar operações bem-sucedidas e erros na mesma distribuição.

Registrar respostas emitidas por guards, pipes e filtros, incluindo 400/401/404/409/429/500 quando os testes exercitarem esses cenários. Aborto/timeout sem resposta HTTP é resultado próprio, com `statusCode: null`, não um status 500 inventado. Rota não encontrada usa template fixo `unmatched`, sem URL arbitrária. Status esperado vem do contrato; status observado vem da execução.

## Métricas e definições

| Campo | Definição |
| --- | --- |
| `requestCount` | Quantidade de amostras concluídas do grupo; abortos/timeouts são contados separadamente |
| `statusCounts` | Contagem por código HTTP observado, sem supor que 2xx significa aceite funcional |
| `serverDurationMs` | Do início do middleware HTTP até conclusão de envio da resposta pelo servidor; relógio monotônico |
| `clientDurationMs` | Do início da requisição do cliente de integração até leitura completa do corpo; inclui transporte/balanceador conforme perfil |
| `requestBodyBytes` | Bytes do corpo enviado pelo cliente de teste, na codificação HTTP declarada |
| `responseBodyBytes` | Bytes do corpo recebido, antes de descompressão; quando o cliente só disponibilizar corpo decodificado, registrar em campo separado |
| `decodedResponseBodyBytes` | Bytes UTF-8/Buffer do corpo decodificado, quando disponíveis; nunca confundir com bytes comprimidos |
| `totalBodyBytes` | Soma de requestBodyBytes e responseBodyBytes medidos na mesma camada |
| `responseItemCount` | Quantidade de pedidos/itens retornados quando aplicável, distinta do volume em bytes |
| `cacheOutcome`, `databaseRole` | hit/miss/bypass e primary/replica, sem detalhes de credenciais |
| `outcome` | completed/aborted/timeout e eventual falha de coleta |

Latências: contagem, mínimo, média, p50, p95, p99 e máximo por grupo. Definir percentil por nearest-rank sobre amostras ordenadas (`ceil(p × n)`); amostra vazia produz `null`. Exibir tamanho amostral e sinalizar percentis com poucas observações; não apresentar uma única chamada como p95 representativo. Para bytes: total, média e máximo por direção; usar bytes como unidade base e KiB = 1024 bytes só na apresentação.

Corpos HTTP não incluem cabeçalhos, framing, TCP/TLS ou retransmissões. O relatório chama esse volume de **bytes de corpo**, sem alegar tráfego total da rede. Se for preciso contabilizar transferência HTTP com cabeçalhos, acrescentar medição própria com camada claramente identificada. Não usar tamanho de string JavaScript como bytes nem confiar apenas em Content-Length; 204 tem corpo de resposta de zero bytes, mesmo havendo cabeçalhos.

## Coleta e isolamento

Adapter de métricas com interface, configuração no bootstrap e flush assíncrono limitado. Instrumentação HTTP envolve o pipeline completo, não apenas o controller, para capturar rejeições da autenticação e erros de validação. Medir com relógio monotônico como `performance.now()`. Evento `finish` do servidor não comprova recebimento pelo cliente; a latência observada pelo cliente é medida separadamente. [Relógio Node.js](https://nodejs.org/api/perf_hooks.html#performancenow), [ciclo HTTP Node.js](https://nodejs.org/api/http.html#event-finish).

Bytes de resposta comprimida devem ser coletados em ponto compatível com a compressão, sem consumir stream antecipadamente nem alterar payload/backpressure. Falta de suporte produz campo `null` e motivo, não estimativa disfarçada. Para o cenário inicial da integração, declarar explicitamente compressão desligada, permitindo comparação entre bytes enviados e recebidos.

Somente dados fictícios. Não armazenar payloads, cabeçalhos Authorization, tokens, documentos, nomes ou IDs internos. Usar IDs técnicos de execução/requisição para correlação segura. Métricas locais agregadas não devem provocar I/O síncrono por requisição; limitar fila, memória e retenção. Coleta incompleta deve aparecer no relatório e impedir sua classificação como válida; a aplicação não deve falhar por indisponibilidade de telemetria.

## Ambiente e reprodutibilidade

Cada execução informa commit, run ID, timestamp UTC, versão do coletor/gerador, runtime, imagem, runner/CPU/memória, perfil Compose, instâncias, pools, volume de dados/seed, casos executados, número de amostras, concorrência, compressão, cache e aquecimento. Ausência de metadado é explícita. Preparação/seed não entram na latência da rota; aquecimento fica separado e identificado.

Aproveitar requisições da integração; não adicionar carga só para fabricar percentis. Resultados de CI são descritivos e não comprovam capacidade produtiva. Limites/SLOs e protocolo de comparação só serão definidos após baseline repetida em ambiente controlado. Comparar grupos equivalentes e informar quando runner, dados, cache ou perfil mudaram; não calcular regressão percentual sem baseline válida ou com denominador zero.

## Relatórios e documentação

Artefatos futuros por execução: `artifacts/performance/<runId>/samples.jsonl` sanitizado, `routes.json` agregado, `routes.md` e manifesto. Status e medição representam o commit informado, inclusive falhas; retenção limitada na CI. Amostras devem ser validadas antes da agregação e percentis globais recalculados a partir das amostras, sem média de percentis entre instâncias.

`make routeReport` agrega esses artefatos deterministicamente e publica tabela por rota/cenário/status no Job Summary, com latência servidor/cliente e bytes em ambas as direções. Não reler logs completos com LLM. [Inventário versionado](performance/rotas.md) registra todas as rotas e linka evidências/baselines revisadas, sem commits automáticos por oscilação numérica. Na fase implementada, rota sem amostras é lacuna e não sucesso; no planejamento atual, “não medida” é o estado honesto.

Gate de documentação/observabilidade futuro: inventário compatível com o contrato, schema válido, métricas obrigatórias dos cenários exigidos e ausência de dados sensíveis. Se a integração falhar, ainda gerar diagnóstico marcado como execução incompleta, sem aprovar merge. Não bloquear por números arbitrários de latência nem aprovar ausência de métricas. Quando SLO/baseline forem aprovados, documentar tolerância, repetições e critério de regressão antes de ativar bloqueio de performance.
