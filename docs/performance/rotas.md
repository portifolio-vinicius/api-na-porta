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

Nenhuma baseline numérica foi promovida a compromisso de desempenho. Relatórios de execução separam cenário, status, cache e perfil; conter contagem de erros/abortos, latência, bytes por direção/total, volume retornado e metadados de execução. Cenários de erro seguem contrato e plano de integração, sem inventar ocorrências.

Tabela versionada mantém rastreabilidade e apenas baselines explicitamente revisadas. Relatórios de cada execução ficam nos artefatos da CI, identificados pelo commit/run ID; o responsável inclui links válidos ao aceitar uma baseline. Não substituir esta tabela por números demonstrativos que pareçam medições reais.
