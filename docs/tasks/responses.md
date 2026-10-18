# Tarefa responses — mensagens-json

- **Branch:** `feature/responses-mensagens-json`
- **Worktree:** `/private/tmp/naporta-responses`
- **Base:** `origin/develop` em `23a69eab3e8d00c94453989831ee07cee9a72499`
- **Status:** em revisão
- **Responsável:** orchestrator

## Arquivos sob responsabilidade

- `backend/src/shared/http`
- `backend/src/main.ts`
- `backend/src/features/health/healthController.ts`
- `backend/test/integration/httpIntegration.mjs`
- `backend/test/integration/composeLifecycle.py`
- `docs/05-api.md`

## Objetivo e aceite

Centralizar códigos, mensagens e envelopes JSON em Messages; integrar sucessos, validação e exceções globalmente; preservar DELETE 204 e sanitização 5xx. Atualizar contrato e verificar por integração HTTP real.

## Dependências

- Contratos HTTP existentes e middleware de correlação; sem dependências de outras tarefas.

## Validação e PR

- **Validação:** `make check` aprovado (lint, typecheck e build); `make docsCheck` aprovado, 36 arquivos sem erros; `make security` aprovado (dependências, segredos, SAST e imagem); `METRICS_DIR=/private/tmp/naporta-responses-metrics make integration` aprovado (67 verificações PostgreSQL, replicação real, 15 verificações de seed, 58 requisições HTTP, ciclo Compose e métricas válidas); `make routeReport` com o mesmo METRICS_DIR aprovado.
- **Evidências:** `/private/tmp/naporta-responses-metrics` contém manifesto, amostras e relatório local sanitizado. Sucessos verificam código e requestId; validações verificam VALIDATION_ERROR; falha real no banco verifica sanitização 500; DELETE verifica ausência de corpo.
- **Compatibilidade:** consumidores passam a ler o resultado em `response.data`; erros preservam envelope `error`; prontidão indisponível usa o filtro global.
- **Escopo adicional:** o consumidor HTTP da integração Compose foi incluído no plano e na reserva porque login, listagem e prontidão passaram a usar o envelope global.
- **PR para develop:** pendente.
