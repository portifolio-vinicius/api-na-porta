# Make, scripts e ambiente local

Nginx, escala Swarm e scripts de permissões estão implementados; veja [infraestrutura e acessos](16-infraestrutura-e-acessos.md).

Os alvos de validação/CI e seus scripts foram implementados; execução e pré-requisitos estão em [13 — Esteiras executáveis](13-esteiras-executaveis.md). O fluxo Git cria worktrees nomeados para várias tarefas planejadas e libera uma implementação por vez; veja [06 — Fluxo de desenvolvimento](06-fluxo-de-desenvolvimento.md). O ambiente completo da API e replicação continuam futuros; detalhes do banco no [documento 15](15-postgresql-operacoes.md). Make é a entrada das validações e das automações repetidas. Scripts validam pré-requisitos, não imprimem segredos e propagam falhas.

## Catálogo de comandos e estado

| Comando | Script / responsabilidade | Estado |
| --- | --- | --- |
| `make help` | Listar alvos e variáveis aceitas | Implementado; pré-requisitos no documento 13 |
| `make startTask TYPE=feature TICKET=124 NAME=filtros-pedidos FILES=backend/src/features/orders,docs/05-api.md` | `scripts/git/start-task.sh`: criar branch nomeada, worktree e registro da tarefa | Implementado; parte de `origin/develop`, registra arquivos e aceite |
| `make taskActivate TICKET=124` | `scripts/git/task-flow.sh activate`: reservar a implementação para um único worktree do clone | Implementado; exige árvore limpa e branch sincronizada com `origin/develop` |
| `make taskRelease TICKET=124` / `make taskStatus` | `scripts/git/task-flow.sh`: manter fila serializada até PR integrar | Implementado; bloqueio persiste durante review e release exige commit ancestral de `origin/develop` |
| `make validateFlow TARGET=develop` | `scripts/git/validate-flow.sh`: conferir origem, destino e estado Git | Implementado; pré-requisitos no documento 13 |
| `make up` | `scripts/dev/up.sh`: validar ambiente, subir banco, migrations, seed, volume de cache e API | Planejado; alvo/script ausentes |
| `make down` | `scripts/dev/down.sh`: parar preservando volumes | Planejado; alvo/script ausentes |
| `make logs SERVICE=api` | `scripts/dev/logs.sh`: logs sem despejar configuração | Planejado; alvo/script ausentes |
| `make migrate ENV=local` | `scripts/db/migrate.sh`: migrations no destino permitido | Implementado; PostgreSQL nativo, documento 15 |
| `make seed ENV=local` | `scripts/db/seed.sh`: carga fictícia idempotente | Implementado; PostgreSQL nativo, documento 15 |
| `make scale API_INSTANCES=2` | `scripts/dev/scale.sh`: perfil escalado, pools e réplica | Planejado; alvo/script ausentes |
| `make replicaInit ENV=local` | `scripts/db/replica-init.sh`: base backup e standby vazio | Planejado; alvo/script ausentes |
| `make replicaStatus ENV=local` | `scripts/db/replica-status.sh`: estado e lag sem segredos | Planejado; alvo/script ausentes |
| `make pipelineCheck` | `scripts/ci/validate.py`: validar as próprias esteiras com fixtures descartáveis | Implementado; contagem corrente emitida pelo comando |
| `make check` | `scripts/check.sh`: linter, typecheck estrito e build | Implementado; pré-requisitos no documento 13 |
| `make security` | `scripts/security/check.sh`: coordenar scripts mínimos de segurança definidos no documento 09 | Implementado; pré-requisitos no documento 13 |
| `make integration` | `scripts/test/backend-integration.sh`: wrapper que exige suíte real do backend; suíte/ambiente ainda ausentes | Implementado; pré-requisitos no documento 13 |
| `make taskPlan TARGET=develop` | `scripts/tasks/plan.sh`: impacto e contexto mínimo | Implementado; pré-requisitos no documento 13 |
| `make docsUpdate` | `scripts/docs/update.sh`: gerar relatório de execução e conferir documentação; texto manual não é reescrito | Implementado; pré-requisitos no documento 13 |
| `make docsCheck` | `scripts/docs/check.sh`: verificar destinos de links locais e correspondência entre contrato HTTP e inventário | Implementado; pré-requisitos no documento 13 |
| `make routeReport` | `scripts/metrics/route-report.sh`: agregar métricas já coletadas na integração | Implementado; pré-requisitos no documento 13 |
| `make ci` | `scripts/ci/check.sh`: coordenar pipelineCheck, plano de impacto, check, security, integração instrumentada, routeReport e docsCheck; falhar se qualquer etapa falhar | Implementado; pré-requisitos no documento 13 |
| `make preMerge TARGET=develop` | `scripts/git/pre-merge.sh`: validar fluxo e executar `make ci`; não faz merge | Implementado; pré-requisitos no documento 13 |

Operações adicionais implementadas:

| Comando | Responsabilidade |
| --- | --- |
| `make dbUp` / `make dbDown` | Subir/parar somente PostgreSQL local preservando o volume |
| `make dbStatus` | Consultar histórico aplicado |
| `make backup` | Exportar dump custom e manifesto de integridade privados |
| `make rollback` | Reverter última migration com plano e backup compatíveis |
| `make restore` | Restaurar dump confiável em destino vazio |
| `make dbIntegration` | Validar operações reais em recursos descartáveis |

Configuração, confirmações e limites ficam no documento 15. Replicação, PITR e ambiente completo da API permanecem planejados.

Os alvos de coordenação aguardam todos os processos iniciados, coletam resultados e propagam falhas. Paralelizar jobs de validação independentes com recursos isolados; implementação de funcionalidades segue uma tarefa ativa por vez conforme o documento 06. Migrations e seed respeitam ordem. Nenhum alvo faz merge sem revisão ou pula gates. Não existe alvo/teste de frontend no escopo atual.

## Docker Compose proposto

Serviços: `db` PostgreSQL com volume/healthcheck; `migrate` job único; `seed` job de desenvolvimento/demonstração; `api` NestJS com prontidão e volume de cache em arquivos. Redis não integra a stack. API recebe tráfego somente após migrations e configuração válidas. Preparação do diretório de cache garante permissões do usuário não root da API, sem torná-lo público.

Volume nomeado de cache montado no caminho interno `CACHE_DIRECTORY`, separado dos dados do PostgreSQL. Cache é descartável; parar ambiente preserva volumes por padrão, limpeza explícita nunca remove dados do banco por associação. Profiles de testes têm banco e cache próprios, credenciais e portas distintas, sem reutilizar volumes locais. Repetir `up` não apaga dados nem duplica seed; falha de migration/seed interrompe inicialização. Banco fica na rede interna.

## Ambiente do usuário e segredos

As operações PostgreSQL atuais usam variáveis `PG*` exportadas e o contrato do documento 15. `USER_ENV_FILE` e as opções de configuração da API abaixo permanecem propostas para o ambiente completo.

Fonte padrão: variáveis exportadas pelo usuário no processo que inicia Make/Compose. Opcionalmente, arquivo privado fora do repositório, como `~/.config/naporta/user.env`, selecionado por `USER_ENV_FILE`. O script passa esse caminho explicitamente a `docker compose --env-file`; não interpreta o arquivo como comandos shell. Restringir permissões do arquivo. `.env.example` futuro contém somente nomes/placeholders.

Compose deve declarar a passagem de cada variável necessária ao serviço via `environment`/interpolação e exigir valores obrigatórios, sem defaults inseguros. Ter a variável no shell ou no arquivo de interpolação não a disponibiliza automaticamente dentro do container. Definir precedência documentada: ambiente exportado pelo usuário prevalece sobre arquivo privado. Não imprimir `docker compose config` resolvido em logs, pois pode revelar segredos. [Referência Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

Configuração proposta: `DATABASE_URL`, credenciais do PostgreSQL por serviço, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_TTL_SECONDS`, `API_PORT`, `CORS_ORIGINS`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `CACHE_DRIVER=file`, `CACHE_DIRECTORY`, `CACHE_TTL_SECONDS`, `CACHE_MAX_BYTES` e limites de entrada/concorrência. Perfil escalado também requer `DATABASE_READ_URL`, credenciais dedicadas de replicação, limites de pool, timeouts e limite de lag; nomes/unidades definitivos dependem do driver selecionado.

Segredos somente nos serviços que os usam, sem build args, Dockerfile, Git ou logs. Backend valida configuração no bootstrap. Na CI, testes usam credenciais efêmeras fictícias geradas no runner; segredos reais ficam em GitHub Secrets/Environments quando necessários em fases futuras, sem serem expostos a PRs externos.

## Seed e carga inicial planejados

O seed atual cria somente um pedido fictício com relações; usuário de demonstração e demais cenários abaixo permanecem futuros.

Conjunto determinístico fictício: usuário de demonstração, pedidos nos status previstos, limites de datas, múltiplos itens, zeros iniciais e soft delete. Senha fornecida por configuração, armazenada como hash e não impressa. Seed transacional/idempotente por chaves estáveis, sem alterar dados fora do conjunto e sem limpeza global; rejeita produção. Fixtures de integração são independentes.

## Perfil escalado e replicação

Perfil futuro `scaled`: balanceador com endpoint único, ao menos duas instâncias API com cache local separado, primário `db`, standby `db-replica` com volume próprio e pooler se necessário. Não compartilhar um cache de arquivos sem protocolo de coordenação; seguir versionamento e consistência do documento 04.

Ordem: primário → migrations/seed uma vez → inicializar standby vazio → conferir streaming → pools/API → prontidão → balanceador. Reutilizar réplica existente; não sobrescrever volume nem reinicializar automaticamente. `replicaStatus` verifica papel e lag; `scale` valida orçamento de conexões. Falha da réplica aplica a política de roteamento; perda do primário impede escrita, sem promoção automática. Reconstrução/promoção exige procedimento explícito.

Validar pela integração do backend: escrita no primário, propagação para standby, consistência imediata, invalidação de cache e JWT aceito por instâncias diferentes. Não criar suíte separada de carga; capacidade real depende de medições e dimensionamento posterior.
