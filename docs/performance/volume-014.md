# Volume API — execução local

Commit: eaeb1d7b00d0e60dd69a38fa57f2a15519159f4f

Base: 100000 pedidos; 240000 itens fictícios. Instâncias: 2. Resultado: aprovado.

| Clientes | Requisições | Req/s efetivas | Erros | p50 cliente ms | p95 cliente ms | p99 cliente ms | Gerador pode limitar |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1636 | 108.93 | 0 | 3.11 | 35.02 | 46.30 | não detectado |
| 10 | 4254 | 282.62 | 0 | 17.46 | 117.96 | 183.56 | não detectado |
| 25 | 4005 | 266.03 | 0 | 75.08 | 274.65 | 401.67 | não detectado |
| 50 | 3773 | 249.01 | 0 | 168.60 | 516.68 | 739.96 | não detectado |
| 100 | 4186 | 275.31 | 0 | 277.38 | 1003.70 | 1511.82 | não detectado |

Modelo fechado: concorrência constante, sem taxa de chegada fixa. Aquecimento separado no JSON. Latências incluem transporte local e leitura completa; req/s incluem a drenagem das requisições iniciadas. Percentis nearest-rank. Há detalhes por cenário, status e métricas do servidor no JSON.

Não comprova capacidade produtiva, failover, balanceador, HTTPS ou leitura em réplica. Cliente e serviços compartilham a máquina; limites dos containers e sinais de saturação do gerador estão no JSON. Documentos/endereços são inteiramente fictícios. Não há corpos, tokens nem identificadores de clientes nos artefatos.

## Evidências adicionais revisadas

Execução autorizada de 2026-10-18: 17.854 requisições nas etapas medidas e 21.486 incluindo aquecimento; zero respostas inesperadas, erros de transporte ou métricas do servidor ausentes. Gerador não atingiu os sinais configurados de limitação por CPU/event loop. Todas as dez fases foram concluídas e a limpeza dos recursos exclusivos foi aprovada.

A base inicial tinha 100.000 pedidos e 240.000 itens: 5.000 pedidos excluídos logicamente, 100.000 UUIDs v4 distintos, PK integer e nenhum pedido sem snapshots/itens. Após o tráfego, o banco continha 102.031 pedidos com UUIDs únicos: 2.031 criações HTTP e 1.949 exclusões lógicas HTTP, conferidas contra as respostas bem-sucedidas. Nenhum item órfão. Credenciais eram efêmeras; nenhuma massa real foi acessada.

Docker disponibilizava seis CPUs e aproximadamente 3,8 GiB de RAM à VM. Limites: banco duas CPUs/1 GiB; duas APIs, cada uma com uma CPU/512 MiB. Cliente e demais processos compartilham o host; o ensaio não representa infraestrutura dedicada. CPU amostrada do banco mostrou pressão durante o teste; isso sugere investigar consultas/contagens e contenção antes de ampliar instâncias, sem concluir causa única apenas pelas amostras.

O throughput ficou entre aproximadamente 249 e 283 req/s nas etapas de 10 a 100 clientes; a latência p95 cresceu de aproximadamente 118 ms para 1.004 ms. Isso indica filas sob maior concorrência neste ambiente e não uma melhora proporcional de capacidade. Os percentis resumem quinze segundos por etapa, não uma janela prolongada nem um SLA.

A primeira rodada com o mesmo volume registrou duas falhas de transporte no aquecimento da etapa 50, com zero erros nas etapas medidas. Ajustou-se somente o gerenciamento de sockets ociosos do gerador e repetiu-se o perfil completo. Nenhuma retentativa HTTP ou alteração no código de produção mascarou falhas; a segunda execução aprovada é a tabela acima. Os relatórios brutos locais de ambas as rodadas permanecem em artifacts/volume, fora do Git.
