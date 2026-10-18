# Inventário e estado da medição por rota

**Estado atual: API implementada e instrumentada; execuções medidas ficam nos artefatos de integração por commit.** `—` significa indisponível, não zero. Códigos abaixo são os esperados no contrato, não resultados observados. Prefixo `/api/v1` incluído. Fonte: [contratos da API](../05-api.md); método de coleta: [performance das rotas](../11-performance-das-rotas.md).

| Método | Rota | Status de sucesso esperado | Estado | Amostras | Latência servidor p50/p95/p99 (ms) | Latência cliente p50/p95/p99 (ms) | Status HTTP observados | Bytes corpo enviados/recebidos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | 200 | Instrumentada | — | — | — | — | — |
| GET | `/health/ready` | 200 | Instrumentada | — | — | — | — | — |
| POST | `/api/v1/orders` | 201 | Instrumentada | — | — | — | — | — |
| GET | `/api/v1/orders` | 200 | Instrumentada | — | — | — | — | — |
| GET | `/api/v1/orders/:id` | 200 | Instrumentada | — | — | — | — | — |
| PATCH | `/api/v1/orders/:id` | 200 | Instrumentada | — | — | — | — | — |
| DELETE | `/api/v1/orders/:id` | 204 | Instrumentada | — | — | — | — | — |

## Evidências e baseline

Nenhuma baseline numérica foi promovida a compromisso de desempenho. A [medição da listagem na tarefa 017](latencia-017.md) é evidência de uma execução curta, não um SLO. Relatórios de execução separam cenário, status, cache e perfil; incluem latência, contagem por grupo/status, bytes por direção/total e manifesto. Volume em itens e contadores de abortos são evolução prevista; o relatório obrigatório atual rejeita execuções incompletas. A [análise 016](latencia-016.md) contém resultados históricos de volume, sem convertê-los em baseline aprovada. Cenários de erro seguem contrato e plano de integração, sem inventar ocorrências.

Tabela versionada mantém rastreabilidade e apenas baselines explicitamente revisadas. Relatórios de cada execução ficam nos artefatos da CI, identificados pelo commit/run ID; o responsável inclui links válidos ao aceitar uma baseline. Não substituir esta tabela por números demonstrativos que pareçam medições reais.
