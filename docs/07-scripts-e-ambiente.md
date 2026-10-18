# Make, scripts e ambiente local

Nginx, escala Swarm e scripts de permissões estão implementados; veja [infraestrutura e acessos](16-infraestrutura-e-acessos.md).

Os alvos de validação/CI e seus scripts estão implementados. Compose combina PostgreSQL e API, migrations, seed e cache. O fluxo Git cria worktrees e permite tarefas ativas com arquivos distintos; veja [06 — Fluxo de desenvolvimento](06-fluxo-de-desenvolvimento.md). A replicação isolada está em [17 — Replicação](17-replicacao.md). Make concentra comandos; scripts validam parâmetros e propagam falhas sem imprimir segredos.

## Catálogo de comandos e estado

| Comando | Script / responsabilidade | Estado |
| --- | --- | --- |
| `make help` | Listar alvos e variáveis aceitas | Implementado; pré-requisitos no documento 13 |
| `make startTask TYPE=feature TICKET=124 NAME=filtros-pedidos FILES=backend/src/features/orders,docs/05-api.md` | `scripts/git/start-task.sh`: criar branch nomeada, worktree e registro da tarefa | Implementado; parte de `origin/develop`, registra arquivos e aceite |
| `make taskActivate TICKET=124` | `scripts/git/task-flow.sh activate`: reservar os arquivos da tarefa e permitir outras tarefas ativas com caminhos distintos | Implementado; exige árvore limpa, branch sincronizada com `origin/develop` e arquivos livres |
| `make taskRelease TICKET=124` / `make taskStatus` | `scripts/git/task-flow.sh`: consultar as tarefas ativas e liberar uma sem encerrar as outras | Implementado; a reserva persiste durante a revisão e o release exige commit ancestral de `origin/develop` |
| `make validateFlow TARGET=develop` | `scripts/git/validate-flow.sh`: conferir origem, destino e estado Git | Implementado; pré-requisitos no documento 13 |
| `make up` | `scripts/dev/up.sh`: validar ambiente, subir banco, migrations, seed, volume de cache e API | Implementado; exige ENV local/demo, URLs PostgreSQL, JWT e usuário fictício |
| `make down` | `scripts/dev/down.sh`: parar preservando volumes | Implementado; seleciona projeto por PGDATABASE |
| `make logs SERVICE=api` | `scripts/dev/logs.sh`: logs sem despejar configuração | Implementado; serviço api ou db |
| `make migrate ENV=local` | `scripts/db/migrate.sh`: migrations no destino permitido | Implementado; PostgreSQL nativo, documento 15 |
| `make seed ENV=local` | `scripts/db/seed.sh`: carga fictícia idempotente | Implementado; PostgreSQL nativo, documento 15 |
| `make scale API_REPLICAS=2` | `scripts/infra/scale.sh`: réplicas da API no Swarm | Implementado; exige cluster preparado, sem prometer capacidade |
| `make replicaInit ENV=local` | `scripts/db/replication.py init`: primário e standby isolados | Implementado; credenciais privadas, volumes separados |
| `make replicaStatus ENV=local` | `scripts/db/replication.py status`: estado e lag sem segredos | Implementado; falha quando streaming indisponível |
| `make replicaDown` / `make replicaIntegration` | Parar preservando volumes / integração descartável real | Implementado; documento 17 |
| `make pipelineCheck` | `scripts/ci/validate.py`: validar as próprias esteiras com fixtures descartáveis | Implementado; contagem corrente emitida pelo comando |
| `make check` | `scripts/check.sh`: linter, geração do Prisma Client, typecheck estrito e build | Implementado; pré-requisitos no documento 13 |
| `make security` | `scripts/security/check.sh`: coordenar scripts mínimos de segurança definidos no documento 09 | Implementado; pré-requisitos no documento 13 |
| `make integration` | `scripts/test/backend-integration.sh`: operações PostgreSQL, réplica e suíte HTTP real do backend | Implementado; pré-requisitos no documento 13 |
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

Configuração, confirmações e limites ficam no documento 15. Replicação e PITR permanecem planejados.

`make up` usa PostgreSQL do Compose existente e combina `backend/compose.yml` para API/cache. Executa migrations e seed SQL pelo executor nativo no host, prepara o usuário fictício via job isolado e só então aguarda a prontidão da API. `make down` preserva volumes. Para iniciar apenas o processo Node sem Compose, configure `DATABASE_URL`, gere o build e execute `npm --prefix backend start`; esse processo não executa migrations ou seed. `/health/ready` fica fora do prefixo `/api/v1` e consulta o banco antes de responder 200; indisponibilidade retorna 503. `make dbUp` sobe somente PostgreSQL.

Os alvos de coordenação aguardam todos os processos iniciados, coletam resultados e propagam falhas. Paralelizar jobs de validação independentes e funcionalidades com arquivos distintos, cada uma no próprio worktree, conforme o documento 06. Migrations e seed respeitam ordem. Nenhum alvo faz merge sem revisão ou pula gates. Não existe alvo/teste de frontend no escopo atual.

## Docker Compose proposto

Serviços: `db` PostgreSQL com volume/healthcheck; migrations e seed SQL executados pelo Make no host com executor existente; `demo-user` job de desenvolvimento/demonstração; `cache-init` prepara volume privado; `api` NestJS com prontidão. Redis não integra a stack. API recebe tráfego somente após migrations, seed e configuração válidas. Preparação do diretório de cache garante permissões do usuário não root da API.

Volume nomeado de cache montado no caminho interno `CACHE_DIRECTORY`, separado dos dados do PostgreSQL. Cache é descartável; parar ambiente preserva volumes por padrão, limpeza explícita nunca remove dados do banco por associação. Profiles de testes têm banco e cache próprios, credenciais e portas distintas, sem reutilizar volumes locais. Repetir `up` não apaga dados nem duplica seed; falha de migration/seed interrompe inicialização. Banco fica na rede interna.

## Ambiente do usuário e segredos

As operações PostgreSQL atuais usam variáveis `PG*` exportadas e o contrato do documento 15. `USER_ENV_FILE` e as opções de configuração da API abaixo permanecem propostas para o ambiente completo.

Fonte padrão: variáveis exportadas pelo usuário no processo que inicia Make/Compose. Opcionalmente, arquivo privado fora do repositório, como `~/.config/naporta/user.env`, selecionado por `USER_ENV_FILE`. O script passa esse caminho explicitamente a `docker compose --env-file`; não interpreta o arquivo como comandos shell. Restringir permissões do arquivo. `.env.example` futuro contém somente nomes/placeholders.

Compose deve declarar a passagem de cada variável necessária ao serviço via `environment`/interpolação e exigir valores obrigatórios, sem defaults inseguros. Ter a variável no shell ou no arquivo de interpolação não a disponibiliza automaticamente dentro do container. Definir precedência documentada: ambiente exportado pelo usuário prevalece sobre arquivo privado. Não imprimir `docker compose config` resolvido em logs, pois pode revelar segredos. [Referência Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

`make up` exige `ENV=local|demo`; `PGUSER=postgres`, `PGPASSWORD` administrativa, `PGHOST`, `PGPORT` e `PGDATABASE=naporta_<ENV>` para preparar o volume local; `APP_PASSWORD` e `MIGRATOR_PASSWORD` (mínimo 12 caracteres) para criar roles locais; `API_DATABASE_URL` (role `naporta_app`, host `db`) e `MIGRATOR_API_URL` (role `naporta_migrator`, host `db`) com credenciais correspondentes; `JWT_SECRET` (mínimo 32 bytes), `JWT_ISSUER`, `JWT_AUDIENCE`, `DEMO_USER_EMAIL` e `DEMO_USER_PASSWORD` (12 a 128 bytes). O script confere host, database, roles e correspondência de senhas nas URLs sem imprimi-las. O bootstrap local limita a criação de roles a bancos `naporta_local`/`naporta_demo`; não usar em produção. `API_PORT` é 3000; `JWT_TTL_SECONDS` é opcional (padrão 900, faixa de 60 a 3600). `CACHE_DIRECTORY` é `/var/cache/naporta` no Compose; a implementação limita TTL e ocupação. Pedidos aceitam corpo de até 1 MiB, até 100 itens por pedido e pageSize até 100. Perfil escalado também requer `DATABASE_READ_URL`, credenciais dedicadas de replicação, limites de pool, timeouts e limite de lag.

Segredos somente nos serviços que os usam, sem build args, Dockerfile, Git ou logs. Backend valida configuração no bootstrap. Na CI, testes usam credenciais efêmeras fictícias geradas no runner; segredos reais ficam em GitHub Secrets/Environments quando necessários em fases futuras, sem serem expostos a PRs externos.

## Seed e carga inicial planejados

O seed SQL básico cria um pedido fictício com relações. `make seed SEED_PROFILE=full` cria seis pedidos e onze itens fictícios, com todos os status, datas variadas, número com zeros iniciais e exclusão lógica. `make up` usa o perfil completo. `make seedIntegration` valida ambos os perfis em PostgreSQL real. `seed:demo-user` cria de forma idempotente somente um usuário fictício em `local`/`demo`, usando Argon2id e credencial de migration; usuário e senha não são impressos. Repetições preservam dados existentes e incrementam a versão de cache na mesma transação.

Conjunto determinístico fictício: usuário de demonstração, pedidos nos status previstos, limites de datas, múltiplos itens, zeros iniciais e soft delete. Senha fornecida por configuração, armazenada como hash e não impressa. Seed transacional/idempotente por chaves estáveis, sem alterar dados fora do conjunto e sem limpeza global; rejeita produção. Fixtures de integração são independentes.

## Perfil escalado e replicação

Perfil futuro `scaled`: balanceador com endpoint único, ao menos duas instâncias API com cache local separado, primário `db`, standby `db-replica` com volume próprio e pooler se necessário. Não compartilhar um cache de arquivos sem protocolo de coordenação; seguir versionamento e consistência do documento 04.

Ordem: primário → migrations/seed uma vez → inicializar standby vazio → conferir streaming → pools/API → prontidão → balanceador. Reutilizar réplica existente; não sobrescrever volume nem reinicializar automaticamente. `replicaStatus` verifica papel e lag; `scale` valida orçamento de conexões. Falha da réplica aplica a política de roteamento; perda do primário impede escrita, sem promoção automática. Reconstrução/promoção exige procedimento explícito.

Validar pela integração do backend: escrita no primário, propagação para standby, consistência imediata, invalidação de cache e JWT aceito por instâncias diferentes. Não criar suíte separada de carga; capacidade real depende de medições e dimensionamento posterior.
