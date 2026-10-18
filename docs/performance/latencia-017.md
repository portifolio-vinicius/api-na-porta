# Latência da listagem — tarefa 017

Medição de 2026-10-18 no mesmo host, depois da análise da [tarefa 016](latencia-016.md). A listagem quente já respondia em cerca de 1 ms quando o cache acertava. O custo alto aparecia quando a versão mudava: cada cliente repetia a consulta e a gravação do cache varria o diretório. Esta tarefa altera o banco e esse caminho da aplicação.

## O que mudou

- Migration `20261018000100_orders_list_indexes`: `orders_active_created_idx` em `(created_at DESC, id DESC)` e `orders_active_status_created_idx` em `(status, created_at DESC, id DESC)`, ambos com `WHERE deleted_at IS NULL`. O executor aplica a migration dentro de uma transação, então os índices não são criados com `CONCURRENTLY`. Em 100.000 pedidos a criação levou 79 ms. Uma tabela maior segura escritas durante o build.
- A contagem exata da listagem ampla permanece. Um contador global foi descartado: a leitura passaria a esperar a mesma linha que todas as escritas atualizam.
- O número do pedido é único. A listagem filtrada por número não executa `COUNT` separado. `total` é 0 ou 1, também quando a página pedida é posterior à primeira e volta vazia.
- A página, o total e a versão saem do mesmo snapshot `RepeatableRead`. A entrada de cache só é gravada se essa versão ainda é a observada antes da consulta.
- A chave do arquivo deixa de incluir a versão. O valor guarda a versão, e a rota só aceita o arquivo se a versão do primário for a mesma antes e depois da leitura. Uma versão nova reaproveita o arquivo em vez de acumular entradas órfãs.
- Leituras simultâneas da mesma versão e dos mesmos filtros compartilham uma consulta, com limite de 64. Versões diferentes não compartilham resultado.
- A ocupação do diretório de cache é lida uma vez por processo e atualizada nas gravações e remoções. Cada gravação apaga no máximo 256 outros arquivos para respeitar a cota. Arquivo ausente não gera outra remoção. Até oito gravações ficam enfileiradas; acima disso a gravação é omitida e a rota segue com o banco.

## Massa e ambiente

Banco descartável, PostgreSQL 18 da imagem fixada em `config/postgres-image.txt`, duas CPUs, 2 GiB, volume em tmpfs. 100.000 pedidos, 200.000 itens, 5.000 excluídos logicamente e 57.000 pendentes ativos. A API rodou no host, com pool de dez conexões e cache em arquivo. Não é o perfil de 1 GiB nem a janela de 15 s da tarefa 016. Não há Nginx, HTTPS, réplica nem segundo processo de API.

Os tempos SQL são a mediana de cinco `EXPLAIN (ANALYZE)` no `Execution Time`, sem contar aquecimento separado. Os tempos HTTP são percentis nearest-rank (`ceil(p × n)`) do cliente, só com status 200. Duas fases em que o processo da API deixou de aceitar conexões foram descartadas e repetidas num harness menor.

## Banco

| Consulta | Sem os índices (ms) | Com os índices (ms) |
| --- | --- | --- |
| Pendentes, página 1, `LIMIT 20` | 9,253 | 0,026 |
| `COUNT` dos 57.000 pendentes ativos | 6,116 | 4,234 |
| Busca por número exato | 0,019 | 0,017 |

Os índices ocupam 2,88 MiB e 3,70 MiB. Cem atualizações da mesma linha, cada uma na própria transação e com incremento de `cache_versions`, levaram 105 ms sem os índices e 118 ms com eles. A lista ordenada deixa de varrer e ordenar; a contagem exata continua na casa de alguns milissegundos.

## Rota com cache estável

Oito segundos de medição e dois de aquecimento. Sem escritas concorrentes, a listagem pendente ficou em acerto de cache.

| Código | Índices | 1 cliente, p50 (ms) | 25 clientes, p50 / p95 (ms) |
| --- | --- | --- | --- |
| develop | não | 1,273 | 15,050 / 57,580 |
| candidato | sim | 1,026 | 9,795 / 31,726 |

Nesse regime a rota já não espera a ordenação do banco. O ganho é o da leitura de arquivo e da versão, não o do índice.

## Rota enquanto a versão muda

Um cliente à parte atualizava uma linha antiga e incrementava `cache_versions` a cada 40 ms. Concorrência 25 na listagem pendente.

No harness de oito segundos mais dois de aquecimento:

| Código | Índices | p50 / p95 (ms) | Respostas 200 na janela de 8 s | Cache na fase, incluindo aquecimento |
| --- | --- | --- | --- | --- |
| develop | não | 339,581 / 499,330 | 570 | 0 acertos, 712 faltas |
| candidato | sim | 11,694 / 34,110 | 13.128 | 7.782 acertos, 7.466 faltas |

No harness de cinco segundos, com o escritor já ativo antes da medida:

| Código | Índices | p50 / p95 (ms) | Respostas 200 em 5 s |
| --- | --- | --- | --- |
| develop | sim | 87,136 / 157,374 | 1.327 |
| candidato | não | 39,641 / 60,006 | 3.396 |

Os índices sozinhos reduzem a consulta, mas os 25 clientes ainda disparam a listagem a cada versão. Compartilhar a leitura da mesma versão evita essa repetição mesmo antes do índice. As duas mudanças juntas foram o menor tempo medido, 11,7 ms de p50, com cerca de metade das respostas servidas do arquivo porque várias chegaram dentro da mesma versão.

A listagem por número, já aquecida, ficou em acerto de cache nos dois códigos (p50 de 1,153 ms no develop e 0,918 ms no candidato). A busca SQL por número já era de 0,02 ms. O efeito novo é não contar de novo na falta de cache. A página 2 desse número manteve `total` 1 e lista vazia.

## Cache de arquivos

Diretório com 2.000 arquivos antigos de 2 KiB. Doze páginas distintas de pedidos entregues, cada uma uma falta de cache seguida de gravação. Índices presentes.

| Código | Primeira página (ms) | Mediana das outras onze (ms) |
| --- | --- | --- |
| develop | 93,064 | 45,275 |
| candidato | 153,461 | 16,678 |

A primeira gravação do candidato percorre o diretório para montar a cota. As seguintes não repetem esse `lstat`. No develop, cada gravação percorre os arquivos de novo.

## O que permanece

A contagem exata de um status ou da lista inteira continua custando alguns milissegundos e não cabe num índice de ordenação. Páginas profundas continuam com `OFFSET`. Réplica de leitura, Redis e aumento do pool ficam fora: a tarefa 016 não mostrou necessidade deles, e o pool de dez já satura quando cada requisição abre várias consultas. Não há SLA. Uma janela curta, num host só, não substitui o perfil de volume da tarefa 016.
