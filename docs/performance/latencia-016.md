# Análise de latência da API — tarefa 016

Avaliação de 2026-10-18. A primeira melhoria recomendada é indexar a ordenação da listagem no PostgreSQL existente. O experimento confirmou a troca de varredura/ordenação por busca em índice. Cache, contagem exata e serialização de escritas permanecem pontos de investigação; não há melhoria HTTP implantada por esta tarefa.

## Origem e alcance das evidências

- Código e migrations avaliados: `origin/develop` em `330e24a3c0503fe2a2f32d032808c0cc0755be71`.
- Medição HTTP: commit `eaeb1d7b00d0e60dd69a38fa57f2a15519159f4f`, tarefa 014, [PR #7 — benchmark e relatório completo](https://github.com/portifolio-vinicius/api-na-porta/pull/7). A suíte opcional e a documentação dessa tarefa ainda aguardam integração; não presumir que `make apiVolume` existe em develop.
- Massa: 100.000 pedidos fictícios, 240.000 itens, 5.000 pedidos excluídos logicamente. UUIDs v4 únicos; PK/FK integer internas, nenhum item órfão. A massa de volume da 014 entrou nessa branch no commit `a0c3905`.
- Ambiente HTTP: banco com duas CPUs/1 GiB, duas APIs com uma CPU/512 MiB cada; Docker com seis CPUs e aproximadamente 3,8 GiB compartilhados com o gerador. Cache de arquivos, mistura aproximada de 70% leituras/30% escritas.
- Diagnóstico SQL adicional: banco Docker descartável e exclusivo, PostgreSQL 18 na imagem fixada em `config/postgres-image.txt`, duas CPUs/1 GiB, migrations nativas da base avaliada e a mesma massa de 100.000 pedidos da 014. Sem API, concorrência, cache de aplicação ou tráfego de escritas durante a medição SQL.

Os bancos e containers externos ao diagnóstico não foram acessados ou alterados. Índices candidatos foram criados e removidos apenas no banco descartável; container e volume anônimo foram removidos ao finalizar.

## O que a medição HTTP mostrou

| Clientes simultâneos | Req/s efetivas | p95 cliente (ms) | p99 cliente (ms) |
| --- | --- | --- | --- |
| 1 | 108,93 | 35,02 | 46,30 |
| 10 | 282,62 | 117,96 | 183,56 |
| 25 | 266,03 | 274,65 | 401,67 |
| 50 | 249,01 | 516,68 | 739,96 |
| 100 | 275,31 | 1.003,70 | 1.511,82 |

Foram 17.854 requisições nas etapas medidas, zero erros e nenhuma amostra HTTP concluída sem métrica do servidor. Cada etapa medida durou quinze segundos, com aquecimento separado de três segundos. Modelo fechado: concorrência constante; req/s incluem drenagem. Não representa uma taxa de chegada fixa, teste prolongado ou SLA de produção.

O aumento de concorrência acima de dez clientes deixou a vazão próxima de um platô e aumentou as filas. Com um cliente, o p50 do detalhe foi 1,49 ms; listagem frequente, 34,04 ms; listagem filtrada, 19,04 ms; filtro por número, 14,37 ms. Com cem clientes, o p95 por cenário foi:

| Cenário | p95 cliente (ms) |
| --- | --- |
| Detalhe por UUID | 601,14 |
| Listagem frequente de pendentes | 1.635,61 |
| Listagem filtrada | 1.243,10 |
| Filtro por número | 905,40 |
| Criação | 418,20 |
| Atualização | 468,10 |
| Exclusão lógica | 397,60 |

Há custo maior no caminho da listagem mesmo antes de alta concorrência. A CPU amostrada do banco sugere pressão, mas não comprova isoladamente que toda a latência venha do banco. Não houve teste de Nginx, HTTPS, leitura em réplica ou failover.

## Consultas reais: índice candidato e controle por reversão

Em `backend/src/features/orders/ordersRepository.ts`, `findActive` busca a página ordenando por `createdAt DESC, id DESC` e calcula `total` em transação `RepeatableRead`. A captura pelo evento de query do Prisma confirmou cinco SELECTs por listagem: pedidos, clientes, endereços, itens ativos e contagem. As relações são carregadas em consultas em lote; não foi observado um SELECT por pedido.

Foram reaplicados os SQLs parametrizados capturados, com `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, na ordem original, em uma transação `RepeatableRead` por repetição. Para cada consulta e fase: duas execuções de aquecimento descartadas e sete medidas; valores abaixo são medianas do `Execution Time` do PostgreSQL. `ANALYZE` foi executado após seed, criação e remoção dos índices; sem `VACUUM` adicional ou alteração de parâmetros do planner.

| Consulta de pedidos, tamanho 20 | Índices atuais (ms) | Índices candidatos (ms) | Após removê-los (ms) |
| --- | --- | --- | --- |
| PENDING, página 1 | 31,655 | 0,085 | 20,607 |
| IN_TRANSIT, página 20 | 5,790 | 0,134 | 5,871 |
| Sem status, página 1 | 30,042 | 0,115 | 23,906 |

Antes, PENDING e listagem sem status usaram varredura sequencial paralela, ordenação e `Gather Merge`. IN_TRANSIT usou bitmap sobre o índice simples de status e ordenou 24.000 registros. Com os candidatos, os três planos passaram a `Index Scan` sem nó de ordenação: vinte registros para a página inicial; quatrocentos para o OFFSET 380 da página vinte. Na página inicial PENDING, buffers compartilhados encontrados passaram de 1.280 para 23. Ao remover os índices, os planos com ordenação retornaram.

Os tempos variam no host compartilhado; a reversão confirma o efeito no plano, sem justificar um multiplicador de capacidade HTTP. Não houve nova medição HTTP com os candidatos nem avaliação do custo adicional nas escritas. As relações do Prisma continuaram usando índices existentes.

A contagem exata permaneceu relevante:

| Contagem | Índices atuais (ms) | Com candidatos (ms) | Após remoção (ms) |
| --- | --- | --- | --- |
| PENDING, 57.000 ativos | 7,656 | 10,172 | 5,947 |
| IN_TRANSIT, 24.000 ativos | 2,738 | 2,569 | 2,502 |
| Todos, 95.000 ativos | 9,921 | 15,809 | 10,448 |

A contagem ampla continuou com varredura sequencial; as filtradas continuaram com bitmap de status. Os candidatos resolvem a ordenação, não o custo de contar todas as correspondências. Os sete resultados por consulta são amostras locais curtas, sem intervalo de confiança.

### SQL para reproduzir a comparação

Executar exclusivamente em banco descartável, com migrations e massa da tarefa 014. O schema e os filtros abaixo reproduzem a consulta principal capturada, sem exportar parâmetros de clientes ou IDs. Repetir os dois aquecimentos e as sete medidas em cada fase; repetir também sem status e com IN_TRANSIT/OFFSET 380. Para as relações, capturar novamente pelo Prisma usando a própria página sintética, sem persistir os parâmetros.

```sql
ANALYZE;
BEGIN ISOLATION LEVEL REPEATABLE READ;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT id, public_id, number, expected_delivery_date, status,
       created_at, updated_at, deleted_at
FROM public.orders
WHERE deleted_at IS NULL AND status = 'PENDING'::public.order_status
ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET 0;
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT COUNT(*) FROM (
  SELECT id FROM public.orders
  WHERE deleted_at IS NULL AND status = 'PENDING'::public.order_status
  OFFSET 0
) AS sub;
COMMIT;

-- Candidatos experimentais; não são migrations aprovadas.
CREATE INDEX latency_orders_active_created_idx
ON public.orders (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX latency_orders_active_status_created_idx
ON public.orders (status, created_at DESC, id DESC) WHERE deleted_at IS NULL;
ANALYZE;
-- Repetir as medições acima e depois o controle por reversão:
DROP INDEX public.latency_orders_active_created_idx,
           public.latency_orders_active_status_created_idx;
ANALYZE;
```

O índice B-tree pode atender `ORDER BY` com `LIMIT` sem ordenar todas as correspondências; o predicado parcial coincide com o filtro estável `deleted_at IS NULL`. Referências: [PostgreSQL 18 — índices e ordenação](https://www.postgresql.org/docs/18/indexes-ordering.html), [índices parciais](https://www.postgresql.org/docs/18/indexes-partial.html), [EXPLAIN](https://www.postgresql.org/docs/18/using-explain.html).

## Soluções viáveis dentro da arquitetura atual

| Prioridade | Solução | Evidência e aceite antes de integrar |
| --- | --- | --- |
| 1 | Nova migration com índices de ordenação para ativos, com e sem status | Benefício confirmado nos planos acima. Preservar migrations aplicadas; definir rollback e estratégia de criação compatível com o executor. Validar tamanho dos índices, custo de escrita e HTTP no perfil completo antes/depois. |
| 2 | Reduzir manutenção por gravação do cache de arquivos | `FileCacheAdapter.writeEntry` percorre o diretório e faz `lstat` sequencial para calcular ocupação. Entradas de versões antigas podem acumular até limpeza/limite. Custo existe no código; contribuição na latência ainda não medida. Avaliar controle de ocupação com reconciliação limitada, mantendo cotas, atomicidade, permissões, validade e fallback. |
| 2 | Medir reaproveitamento do cache e consultas concorrentes idênticas | Toda mutação incrementa a mesma versão; em carga mista, páginas podem perder validade rapidamente. Medir hit/miss/bypass por cenário. Avaliar deduplicação limitada de leituras por versão/chave, sem remover revalidação transacional nem compartilhar respostas de versões distintas. |
| 3 | Otimizar busca por número exato | Número é único. Pode-se evitar COUNT separado derivando total 0/1 de uma busca com todos os filtros. Exige preservar `total` correto inclusive em páginas posteriores à primeira. Benefício HTTP ainda não medido. |
| 3 | Investigar contagens amplas e contenção de escrita | Toda criação/alteração/exclusão atualiza a única linha de `cache_versions.orders`, serializando esse trecho entre escritores. Capturar tempos de espera/locks antes de redesenhar; a linha garante invalidação coerente e não deve ser removida sem substituto validado. |

Não aumentar o pool de dez conexões por instância como primeira medida: duas APIs já podem abrir vinte conexões e o ensaio mostrou pressão no banco. Mais conexões/instâncias precisam de comparação controlada. Redis não é necessário para os índices propostos; não há motivo demonstrado para introduzi-lo nesta etapa.

Réplicas atuais são standby físico assíncrono e as rotas usam o primário. Distribuir leituras exigiria definir tolerância ao atraso e preservar leitura após escrita/cache. Réplica read-only não substitui automaticamente o primário quando ele cai. Cursor poderia reduzir custo de páginas profundas, mas mudaria o contrato atual de paginação; as primeiras vinte páginas não medem esse problema em profundidade.

## Próxima validação e estado da entrega

Esta tarefa entrega diagnóstico e documentação; não altera código de produção, migrations, pools ou infraestrutura. Os índices são a proposta com evidência experimental mais forte. Cache e locks permanecem hipóteses de contribuição que exigem instrumentação.

Depois da integração da 014, criar tarefa própria para a migration e comparar o mesmo perfil de cem mil pedidos: dois processos de API, cache file, limites idênticos, concorrências 1/10/25/50/100, quinze segundos de medição e três de aquecimento. Usar `make apiVolume` com diretório novo por execução e fonte commitada/limpa. Repetir baseline e candidato no mesmo ambiente, registrando dispersão, latência por cenário, erros, hit/miss, CPU, I/O e escritas. Não comparar somente percentis globais nem transformar melhoria SQL em promessa de capacidade.

Aceite funcional preserva UUID público, ausência de PK/FK nas respostas, contagem/páginas coerentes, soft delete, filtros, estados finais, autenticação e invalidação entre instâncias. `make preMerge TARGET=develop` e gate remoto continuam obrigatórios para a implementação. Teste de volume opcional não substitui esses gates nem comprova failover ou SLA.

A implementação posterior está na [tarefa 017](latencia-017.md): os dois índices entraram em migration, o cache deixou de varrer o diretório a cada gravação e leituras idênticas da mesma versão compartilham uma consulta. Essa medição usa outro limite de memória, uma API no host e janelas de cinco e oito segundos. Ela não substitui o perfil desta análise nem promove os números a SLA.
