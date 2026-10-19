# Fluxo de desenvolvimento e orchestrator

O repositório usa `develop` como integração contínua e `master` como destino de versões aprovadas. Várias funcionalidades podem ser implementadas ao mesmo tempo. Cada uma fica em um worktree e em uma branch próprios, criados a partir de `origin/develop`. O registro do clone reserva os arquivos de cada tarefa ativa e recusa outra ativação que use o mesmo caminho.

## Branches e sincronização

```text
origin/develop
  ├── feature/123-criar-pedido       worktree ativo
  ├── feature/124-filtros-pedidos    worktree ativo, arquivos distintos
  └── fix/125-periodo-invertido       worktree ativo, arquivos distintos

cada branch → seu PR para develop → integração quando o gate passar
develop → PR para master após validação
```

O nome identifica ticket e funcionalidade: `feature/<ticket>-<slug>` ou `fix/<ticket>-<slug>`. `feature/124-filtros-pedidos` e outros exemplos de branch não têm relação com feature folders do código.

Cada tarefa parte do `origin/develop` atualizado e tem seu próprio worktree, plano em `docs/tasks/<ticket>.md`, aceite, dependências e lista de arquivos sob responsabilidade. Duas tarefas ativas não podem listar o mesmo caminho nem um diretório que contenha o caminho da outra. Worktrees isolam os diretórios de trabalho; a reserva de arquivos evita que duas implementações editem o mesmo contrato ao mesmo tempo. Ela não elimina conflito de merge se a base mudar.

Depois que um PR entra em `develop`, cada branch ainda aberta que precise dessa base atualiza o próprio `origin/develop` antes do merge dela. Não copie commits de uma feature para outra. Uma tarefa que dependa de outra só começa depois que essa base entrar em `develop`. Cada PR adiciona uma funcionalidade à integração sem reescrever histórico compartilhado.

A publicação inicial criou `master` e `develop` no commit `763efbd`. Cada nova tarefa parte de `origin/develop` atualizado; não recriar branches protegidas. Sem commits ou push diretos em `master` ou `develop`. O ruleset exige PR, merge commit, branch atualizada e gate aprovado; bloqueia force push e exclusão, sem bypass. Correções urgentes também partem de `develop`.

## Preparar várias tarefas

Execute `make startTask` a partir de qualquer worktree limpo. O comando atualiza referências e cria uma branch e um worktree a partir de `origin/develop`. Informe os arquivos sob responsabilidade; revise e complete o registro gerado antes de ativar:

```sh
make startTask TYPE=feature TICKET=123 NAME=criar-pedido FILES=backend/src/features/orders,docs/05-api.md
make startTask TYPE=feature TICKET=124 NAME=login FILES=backend/src/features/auth
```

Os arquivos dos exemplos não se sobrepõem, então as duas tarefas podem ser implementadas ao mesmo tempo. O script não faz push, commit ou PR.

## Ativar tarefas em paralelo

No worktree da tarefa, complete e commite `docs/tasks/<ticket>.md`. Atualize a branch com `origin/develop` se essa base mudou desde a criação. Depois reserve os arquivos:

```sh
cd ../LOVEL-NA-PORTA-123-criar-pedido
make taskActivate TICKET=123
cd ../LOVEL-NA-PORTA-124-login
make taskActivate TICKET=124
make taskStatus
```

`taskStatus` lista todas as tarefas ativas, com branch, worktree e arquivos. `taskActivate` recusa a segunda tarefa quando algum caminho coincide com uma reserva existente e informa o ticket que já o possui. Implemente somente os arquivos e o aceite registrados nessa tarefa.

Concluída a implementação, rode os gates aplicáveis, deixe a árvore limpa e abra o PR. A reserva dessa tarefa continua durante a revisão e a CI. As outras tarefas ativas seguem nos próprios worktrees. Depois que o PR for integrado em `develop`, libere só essa tarefa:

```sh
make taskRelease TICKET=123
```

`taskRelease` exige árvore limpa e confirma que o commit da tarefa já é ancestral de `origin/develop`. Liberar uma tarefa não libera as demais. O registro fica no diretório Git compartilhado do clone, fora dos worktrees e do commit. A automação não impede edição manual de uma branch inativa; o protocolo de ativação continua obrigatório para reservar os arquivos.

## Orchestrator e estados

O orchestrator coordena dependências e contratos e pode delegar implementações simultâneas a worktrees isolados. Deve:

1. Registrar objetivo, aceite, dependências, responsável e arquivos exclusivos em cada tarefa.
2. Atribuir um único responsável para cada arquivo compartilhado entre tarefas que vão andar juntas.
3. Ativar em paralelo as tarefas cujos arquivos não se sobrepõem.
4. Revisar cada tarefa, executar os gates e publicar o PR para `develop` sem esperar as outras tarefas independentes.
5. Integrar cada PR quando os gates obrigatórios passarem e atualizar as branches que ainda dependem dessa base.
6. Validar o conjunto acumulado em `develop` antes do PR `develop → master`.

Estados: `planejada → em andamento → em revisão → integrada`. Várias tarefas podem ocupar `em andamento` ou `em revisão` ao mesmo tempo. Arquivos em conflito ficam em uma única tarefa ativa até a integração.

## Caminho de integração

- **Planejamento:** criar um worktree por funcionalidade, com slug distinto e arquivos registrados.
- **Implementação:** ativar cada tarefa independente e implementá-la no próprio worktree. A reserva permanece enquanto o PR aguarda gates e revisão.
- **Sincronização:** depois de cada merge, atualizar as branches que ainda serão integradas com `origin/develop` e repetir os gates delas.
- **PR:** abrir um PR por funcionalidade, com base `develop`. Vários PRs podem ficar abertos. O merge exige o gate aprovado.
- **Produção:** PR `develop → master`, checks completos, revisão da compatibilidade de migrations e aprovação humana.

`make preMerge TARGET=develop` valida a branch commitada; CI repete os gates no commit do PR. Os scripts não fazem merge, push forçado, reset destrutivo nem deploy automático. A promoção comprova que `origin/master` é ancestral do candidato e não perde alterações.
