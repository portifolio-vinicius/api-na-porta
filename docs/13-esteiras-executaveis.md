# Esteiras executáveis

Implementadas em 2026-10-16 após autorização para sair da etapa documental. Bootstrap, prontidão, login JWT e todas as rotas de pedidos estão implementados; cache e integração HTTP continuam pendentes. Operações PostgreSQL reais estão no [documento 15](15-postgresql-operacoes.md). Este documento registra o estado executável; os documentos 07–11 conservam também contratos futuros.

## Uso

Na raiz, com Bash, Make, Python 3.9+ e Git:

```sh
make help
make pipelineCheck
make docsCheck
make taskPlan TARGET=develop
```

Para executar cada etapa separadamente, com Node.js 24.21.0, npm e Docker ativo:

```sh
make check
make security
make integration METRICS_DIR=artifacts/performance/execucao-001
make routeReport METRICS_DIR=artifacts/performance/execucao-001
make docsCheck
```

`make ci` coordena sequencialmente `pipelineCheck`, `taskPlan`, `check`, `security`, `integration`, `routeReport` e `docsCheck`. Continua coletando os resultados após uma falha, mas retorna erro se qualquer etapa falhar. Cada execução de integração exige um `METRICS_DIR` novo para impedir reaproveitamento silencioso de artefatos antigos. `make preMerge TARGET=develop` valida o fluxo Git antes de executar CI; não cria commits, branches, PRs, merges ou deploys. Scripts shell aceitam `--help`.

## Implementação

| Alvo | Validação efetiva |
| --- | --- |
| `pipelineCheck` | Sintaxe shell/Python e cenários sintéticos descartáveis do gate, relatório e links |
| `check` | Exige manifesto/lockfile do backend, instala via `npm ci --ignore-scripts` e executa scripts `lint`, `typecheck`, `build` |
| `security` | Executa todos os quatro scanners, mesmo se um falhar, e propaga reprovação |
| `integration` | Exige `test:integration`, testes em `backend/test`, Docker e diretório novo de métricas; executa suíte com zero testes proibido e valida seus artefatos |
| `routeReport` | Valida amostras/manifesto e gera JSON/Markdown determinísticos; não faz requisições nem dispara testes |
| `docsCheck` | Verifica existência dos destinos de links locais Markdown e correspondência entre contrato HTTP e inventário de rotas |
| `docsUpdate` | Gera relatório de execução e verifica documentação; texto manual permanece sob revisão humana |
| `taskPlan` | Produz `artifacts/task-plan.json`; seleciona sempre conjunto completo, inclusive sem base disponível |
| `validateFlow` | Exige commit, árvore limpa, branch/destino válidos e ancestralidade da referência remota local |
| `preMerge` | Valida fluxo e executa CI; referência remota deve ser atualizada pelo responsável antes da execução |

O backend agora fornece `backend/package.json`, lockfile, `src`, schema Prisma e Dockerfile. `make check` instala as dependências, gera Prisma Client e executa lint, typecheck e build. As operações de banco já são verificadas por `make dbIntegration`, executado antes dos pré-requisitos HTTP por `make integration`. A suíte obrigatória `test:integration` ainda não existe; deve iniciar e limpar banco/cache reais isolados, aplicar migrations e executar os cenários do documento 08, incluindo perfil completo. O wrapper não permite substituir esses testes por mocks. A ausência da suíte continua reprovando o gate de integração, inclusive para a autenticação implementada.

Segurança: npm audit inclui dependências de desenvolvimento e bloqueia high/critical; Gitleaks verifica arquivos e histórico disponível com saída redigida; Semgrep usa regras locais para execução dinâmica, shell e queries inseguras; Trivy verifica configuração e imagem construída. Gitleaks 8.30.1, Semgrep 1.181.0 e Trivy 0.76.0 usam imagens fixadas por digest. Regras SAST iniciais têm cobertura limitada e devem ser ampliadas conforme o código surgir. Falha de ferramenta, download ou pré-requisito reprova a etapa. O scan de imagem não monta o socket Docker no scanner.

## Contrato mínimo das métricas

A suíte escreve em `METRICS_DIR` os arquivos `manifest.json` e `samples.jsonl`. Não registrar corpos, tokens ou dados pessoais. O manifesto contém exatamente:

- `runId`, `commit` (SHA de `git rev-parse HEAD`), `timestamp` UTC e `runtime`: strings não vazias;
- `complete: true`, `profile: "full"` e `compression: "off"`.

Cada linha de amostras contém exatamente: `runId`, `method`, `route` (template do inventário), `scenario` (identificador técnico), `statusCode`, `expectedStatusCode`, `serverDurationMs`, `clientDurationMs`, `requestBodyBytes`, `responseBodyBytes`, `cacheOutcome` (`hit`, `miss`, `bypass`), `databaseRole` (`primary`, `replica`), `outcome` e `profile`.

O validador exige métricas finitas não negativas, bytes inteiros, resposta 204 vazia, status observado igual ao esperado, execução completa, mesmo commit/run/profile, sucesso nas sete rotas e cobertura dos erros 400/401/404/409/429/500. Aborto ou coleta incompleta reprova o relatório. O diagnóstico incompleto não inventa medições. Metadados adicionais de runner, pools, aquecimento, cobertura detalhada dos casos e instrumentação HTTP do documento 11 ainda dependem da aplicação e de evolução do schema.

Relatórios agrupam método, rota, cenário, status, cache, banco e perfil. Latências usam nearest-rank para p50/p95/p99; bytes são de corpo com compressão desligada. Poucas amostras são sinalizadas. Os artefatos são ignorados pelo Git.

## GitHub Actions

[Workflow](../.github/workflows/backend-ci.yml): PR/push para develop/master, execução manual e merge queue. Jobs `backend-quality`, `backend-security`, `backend-integration`, `backend-docs` e `backend-merge-gate`; permissões `contents: read`, actions por SHA, timeouts e cancelamento de runs antigos. Documentação consome as métricas da integração sem repetir testes. Publicação das amostras exige validação prévia. Artefatos têm retenção de sete dias.

O gate usa os resultados reais em `needs` e só aceita `success` para os quatro jobs obrigatórios. Cancelamento, ausência, skip e falha reprovam o gate. O uso de `always()` e dos resultados de dependências segue a [documentação do GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts).

O repositório está publicado, com `master` padrão e `develop` criada. O ruleset remoto está ativo e foi testado rejeitando push direto nas duas branches, inclusive para administrador. Configuração efetiva no [documento 09](09-ci-e-seguranca.md) e evidências de publicação, execução remota e testes no [documento 14](14-publicacao-e-protecao.md). O workflow sozinho não configura essa proteção.

## Evidências locais anteriores à publicação

Registro histórico: execuções realizadas uma por vez, antes do commit inicial e da configuração das proteções. O estado posterior está no [documento 14](14-publicacao-e-protecao.md).

| Comando | Resultado observado |
| --- | --- |
| `make pipelineCheck` | 58 verificações aprovadas: sintaxe, gate com sucesso/falha/cancelamento/skip/ausência, JSON inválido, relatório válido/determinístico e rejeição de artefatos inválidos, links válidos/quebrados |
| `make docsCheck` | Aprovado |
| `make taskPlan` | Aprovado; base ausente seleciona conjunto completo |
| `make check` | Reprovado por ausência do manifesto/lockfile do backend |
| `make security` | Reprovado por backend ausente e serviço Docker indisponível; os quatro scans foram tentados e bloqueados antes de executar as ferramentas |
| `make integration` | Reprovado por backend ausente |
| `make routeReport` | Reprovado por ausência de métricas reais |
| `make ci` | Reprovado; coleta as falhas e não aprova o conjunto |
| `make preMerge TARGET=develop` | Reprovado: repositório sem commit inicial |

Workflow validado com actionlint 1.7.12, sem erros; análise ShellCheck não executada. A sintaxe shell foi verificada com `bash -n`. Os cenários sintéticos rodam em diretórios temporários e não representam integração ou medições reais da API. Na execução remota posterior, Gitleaks aprovou arquivos e histórico. Os demais scanners, build e testes funcionais completos continuam bloqueados pela ausência do backend; veja o documento 14.

## Registro histórico anterior aos scripts PostgreSQL: banco e worktrees

Após a execução acima, foram tentados separadamente `make migrate ENV=local`, `make rollback ENV=local`, `make backup ENV=local`, `make restore ENV=local` e `make startTask TYPE=feature TICKET=124 NAME=filtros-pedidos`. Todos retornaram código 2 por alvo inexistente. Não há schema, migrations, scripts de backup/restauração ou automação de criação de worktrees implementados. Não foram testadas alteração real de modelagem, reversão de estrutura ou recuperação de dados. Backup sem restauração validada não comprova recuperação.

O script existente `validate-flow.sh` foi exercitado em repositório Git e remoto bare locais descartáveis, com worktree real criado por comando Git manual. Oito verificações passaram: feature limpa para develop; isolamento de alterações nos arquivos; bloqueio de árvore suja; bloqueio de destino inválido; bloqueio de feature para master; bloqueio de develop para develop; aceitação de develop para master com ancestralidade válida; remoção do worktree limpo preservando o repositório base.

Essa verificação não exercitou `startTask`, PRs, proteção de branches, conflitos de merge ou recuperação após falha na criação de worktree. O fluxo automatizado completo de desenvolvimento permanece pendente. As oito verificações de Git/worktree agora integram `make pipelineCheck`, totalizando 58 verificações naquele registro. A versão atual acrescenta checks dos scripts PostgreSQL; a contagem é emitida por `make pipelineCheck`.
