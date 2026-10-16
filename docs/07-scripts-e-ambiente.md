# Make, scripts e ambiente local

Os alvos de validação/CI e seus scripts foram implementados; execução e pré-requisitos estão em [13 — Esteiras executáveis](13-esteiras-executaveis.md). Os alvos de ambiente, branches de tarefa e banco da tabela continuam futuros; não há Compose. Make será a entrada única; receitas curtas chamam scripts compartilhados com CI, sem duplicar lógica. Cada script fornece ajuda, valida pré-requisitos e parâmetros, não imprime segredos e propaga código de saída não zero em falhas.

## Make e scripts propostos

| Comando futuro | Script futuro / responsabilidade |
| --- | --- |
| `make help` | Listar alvos e variáveis aceitas |
| `make startTask TYPE=feature TICKET=124 NAME=filtros-pedidos` | `scripts/git/start-task.sh`: branch de develop e worktree isolado |
| `make validateFlow TARGET=develop` | `scripts/git/validate-flow.sh`: conferir origem, destino e estado Git |
| `make up` | `scripts/dev/up.sh`: validar ambiente, subir banco, migrations, seed, volume de cache e API |
| `make down` | `scripts/dev/down.sh`: parar preservando volumes |
| `make logs SERVICE=api` | `scripts/dev/logs.sh`: logs sem despejar configuração |
| `make migrate ENV=local` | `scripts/db/migrate.sh`: migrations no destino permitido |
| `make seed ENV=local` | `scripts/db/seed.sh`: carga fictícia idempotente |
| `make scale API_INSTANCES=2` | `scripts/dev/scale.sh`: perfil escalado, pools e réplica |
| `make replicaInit ENV=local` | `scripts/db/replica-init.sh`: base backup e standby vazio |
| `make replicaStatus ENV=local` | `scripts/db/replica-status.sh`: estado e lag sem segredos |
| `make check` | `scripts/check.sh`: linter, typecheck estrito e build |
| `make security` | `scripts/security/check.sh`: coordenar scripts mínimos de segurança definidos no documento 09 |
| `make integration` | `scripts/test/backend-integration.sh`: API, banco e cache reais isolados |
| `make taskPlan TARGET=develop` | `scripts/tasks/plan.sh`: impacto e contexto mínimo |
| `make docsUpdate` | `scripts/docs/update.sh`: atualizar somente conteúdo afetado |
| `make docsCheck` | `scripts/docs/check.sh`: validar links, contratos, inventário e divergências |
| `make routeReport` | `scripts/metrics/route-report.sh`: agregar métricas já coletadas na integração |
| `make ci` | `scripts/ci/check.sh`: coordenar plano de impacto, check, security, integração instrumentada, routeReport e docsCheck; falhar se qualquer etapa falhar |
| `make preMerge TARGET=develop` | `scripts/git/pre-merge.sh`: validar fluxo e executar `make ci`; não faz merge |

Os alvos de coordenação aguardam todos os processos iniciados, coletam resultados e propagam falhas. Paralelizar somente jobs independentes com recursos isolados; migrations e seed respeitam ordem. Não criar um alvo que faça merge sem revisão ou pule os gates. Não existe alvo/teste de frontend no escopo atual.

## Docker Compose proposto

Serviços: `db` PostgreSQL com volume/healthcheck; `migrate` job único; `seed` job de desenvolvimento/demonstração; `api` NestJS com prontidão e volume de cache em arquivos. Redis não integra a stack. API recebe tráfego somente após migrations e configuração válidas. Preparação do diretório de cache garante permissões do usuário não root da API, sem torná-lo público.

Volume nomeado de cache montado no caminho interno `CACHE_DIRECTORY`, separado dos dados do PostgreSQL. Cache é descartável; parar ambiente preserva volumes por padrão, limpeza explícita nunca remove dados do banco por associação. Profiles de testes têm banco e cache próprios, credenciais e portas distintas, sem reutilizar volumes locais. Repetir `up` não apaga dados nem duplica seed; falha de migration/seed interrompe inicialização. Banco fica na rede interna.

## Ambiente do usuário e segredos

Fonte padrão: variáveis exportadas pelo usuário no processo que inicia Make/Compose. Opcionalmente, arquivo privado fora do repositório, como `~/.config/naporta/user.env`, selecionado por `USER_ENV_FILE`. O script passa esse caminho explicitamente a `docker compose --env-file`; não interpreta o arquivo como comandos shell. Restringir permissões do arquivo. `.env.example` futuro contém somente nomes/placeholders.

Compose deve declarar a passagem de cada variável necessária ao serviço via `environment`/interpolação e exigir valores obrigatórios, sem defaults inseguros. Ter a variável no shell ou no arquivo de interpolação não a disponibiliza automaticamente dentro do container. Definir precedência documentada: ambiente exportado pelo usuário prevalece sobre arquivo privado. Não imprimir `docker compose config` resolvido em logs, pois pode revelar segredos. [Referência Docker Compose](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

Configuração proposta: `DATABASE_URL`, credenciais do PostgreSQL por serviço, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_TTL_SECONDS`, `API_PORT`, `CORS_ORIGINS`, `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD`, `CACHE_DRIVER=file`, `CACHE_DIRECTORY`, `CACHE_TTL_SECONDS`, `CACHE_MAX_BYTES` e limites de entrada/concorrência. Perfil escalado também requer `DATABASE_READ_URL`, credenciais dedicadas de replicação, limites de pool, timeouts e limite de lag; nomes/unidades definitivos dependem do driver selecionado.

Segredos somente nos serviços que os usam, sem build args, Dockerfile, Git ou logs. Backend valida configuração no bootstrap. Na CI, testes usam credenciais efêmeras fictícias geradas no runner; segredos reais ficam em GitHub Secrets/Environments quando necessários em fases futuras, sem serem expostos a PRs externos.

## Seed e carga inicial

Conjunto determinístico fictício: usuário de demonstração, pedidos nos status previstos, limites de datas, múltiplos itens, zeros iniciais e soft delete. Senha fornecida por configuração, armazenada como hash e não impressa. Seed transacional/idempotente por chaves estáveis, sem alterar dados fora do conjunto e sem limpeza global; rejeita produção. Fixtures de integração são independentes.

## Perfil escalado e replicação

Perfil futuro `scaled`: balanceador com endpoint único, ao menos duas instâncias API com cache local separado, primário `db`, standby `db-replica` com volume próprio e pooler se necessário. Não compartilhar um cache de arquivos sem protocolo de coordenação; seguir versionamento e consistência do documento 04.

Ordem: primário → migrations/seed uma vez → inicializar standby vazio → conferir streaming → pools/API → prontidão → balanceador. Reutilizar réplica existente; não sobrescrever volume nem reinicializar automaticamente. `replicaStatus` verifica papel e lag; `scale` valida orçamento de conexões. Falha da réplica aplica a política de roteamento; perda do primário impede escrita, sem promoção automática. Reconstrução/promoção exige procedimento explícito.

Validar pela integração do backend: escrita no primário, propagação para standby, consistência imediata, invalidação de cache e JWT aceito por instâncias diferentes. Não criar suíte separada de carga; capacidade real depende de medições e dimensionamento posterior.
