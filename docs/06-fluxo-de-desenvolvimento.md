# Fluxo de desenvolvimento e orchestrator

O repositório usa `develop` como integração contínua e `master` como destino de versões aprovadas. Worktrees permitem preparar várias tarefas isoladas, mas a implementação é **sequencial: uma funcionalidade ativa por vez**. A fila pode conter várias branches/worktrees planejados; nenhum código de uma tarefa seguinte é editado até a tarefa ativa ser concluída e liberada. O bloqueio compartilhado do clone registra essa exclusividade.

## Branches e sincronização

```text
origin/develop
  ├── feature/123-criar-pedido       worktree planejado/ativo, uma por vez
  ├── feature/124-filtros-pedidos    worktree planejado, aguardando sua vez
  └── fix/125-periodo-invertido       worktree planejado, aguardando sua vez

cada branch → seu PR para develop → integração sequencial
develop → PR para master após validação
```

O nome identifica ticket e funcionalidade: `feature/<ticket>-<slug>` ou `fix/<ticket>-<slug>`. `feature/124-filtros-pedidos` e outros exemplos de branch não têm relação com feature folders do código.

Cada tarefa parte do `origin/develop` atualizado e tem seu próprio worktree, plano em `docs/tasks/<ticket>.md`, aceite, dependências e lista de arquivos sob responsabilidade. Mais de uma tarefa planejada pode citar o mesmo arquivo, mas somente a tarefa ativa pode editá-lo. Depois da integração, as demais branches recebem o novo `origin/develop` antes de começar a alteração nesse arquivo. Worktrees isolam diretórios; não evitam conflito Git quando duas branches editadas divergem.

A sincronização entre branches ocorre **na ordem da integração**. Após um PR entrar em `develop`, atualize cada branch pendente com o novo `origin/develop` antes de ativá-la e valide os conflitos nessa tarefa. Não copie commits de uma feature para outra nem faça branches dependentes entre si; uma dependência só começa após sua base entrar em `develop`. Assim, cada PR adiciona uma funcionalidade à integração acumulada sem reescrever histórico compartilhado.

A publicação inicial criou `master` e `develop` no commit `763efbd`. Cada nova tarefa parte de `origin/develop` atualizado; não recriar branches protegidas. Sem commits ou push diretos em `master` ou `develop`. O ruleset exige PR, merge commit, branch atualizada e gate aprovado; bloqueia force push e exclusão, sem bypass. Correções urgentes também partem de `develop`.

## Preparar várias tarefas

Execute `make startTask` a partir de qualquer worktree limpo. O comando atualiza referências e cria uma branch e worktree a partir de `origin/develop`, com nome derivado da funcionalidade. Informe os arquivos sob responsabilidade; revise e complete o registro gerado antes de ativar:

```sh
make startTask TYPE=feature TICKET=123 NAME=criar-pedido FILES=backend/src/features/orders,docs/05-api.md
make startTask TYPE=feature TICKET=124 NAME=login FILES=backend/src/features/auth,docs/05-api.md
```

Os arquivos dos exemplos não se sobrepõem. O script cria apenas tarefa planejada; não inicia implementação e não faz push, commit ou PR. Se outra tarefa precisar de um arquivo em uso, espere a integração da tarefa atual e atualize sua branch antes de ativar.

## Ativar uma tarefa por vez

No worktree da tarefa escolhida, complete e commite `docs/tasks/<ticket>.md`; atualize a branch com `origin/develop` caso outra tarefa tenha sido integrada desde sua criação. Depois, ative o bloqueio do clone:

```sh
cd ../LOVEL-NA-PORTA-123-criar-pedido
git fetch origin
git merge --no-edit origin/develop
make taskActivate TICKET=123
make taskStatus
```

Enquanto houver tarefa ativa, `make taskActivate` recusa ativar outro worktree. Implemente somente os arquivos e aceite registrados. A preparação documental e a revisão de requisitos de tarefas em fila podem continuar; edição de código de outra funcionalidade, delegação de implementação paralela e commits em outra branch ficam suspensos.

Concluída a implementação, rode os gates aplicáveis, deixe a árvore limpa e abra o PR. **Mantenha o bloqueio durante revisão e CI.** Depois que o PR for integrado em `develop`, libere a tarefa:

```sh
make taskRelease TICKET=123
```

Em seguida, atualize e ative a próxima branch planejada:

```sh
cd ../LOVEL-NA-PORTA-124-login
git fetch origin
git merge --no-edit origin/develop
make taskActivate TICKET=124
```

O bloqueio fica no diretório Git compartilhado do clone, fora dos worktrees e do commit. `taskStatus` mostra a tarefa ativa. `taskRelease` exige árvore limpa e confirma que o commit da tarefa já é ancestral de `origin/develop`, evitando liberar a próxima funcionalidade antes do merge. Se o processo for interrompido, retome a tarefa no worktree indicado; não apague o bloqueio para iniciar outra em paralelo. A automação não impede edição manual de uma branch inativa, por isso o protocolo de ativação é obrigatório.

## Orchestrator e estados

O orchestrator coordena a fila e revisa contratos; não delega implementação de funcionalidades simultâneas. Deve:

1. Registrar objetivo, aceite, dependências, responsável e arquivos exclusivos em cada tarefa planejada.
2. Definir a ordem por dependência e atribuir um único proprietário para arquivos compartilhados.
3. Manter exatamente uma tarefa em `em andamento`; as demais ficam `planejada`.
4. Revisar a tarefa concluída, executar os gates e publicar seu PR para `develop`, mantendo-a como única tarefa ativa enquanto aguarda.
5. Integrar o PR somente quando os gates obrigatórios passarem; depois atualizar as branches restantes a partir de `origin/develop` antes de ativá-las.
6. Validar novamente o conjunto acumulado em `develop` e só então abrir PR `develop → master`.

Estados: `planejada → em andamento → em revisão → integrada`. Só uma tarefa ocupa os estados `em andamento`/`em revisão` por vez. Requisitos ou arquivos em conflito são resolvidos na fila, antes de ativar a tarefa seguinte.

## Caminho de integração

- **Planejamento:** criar tantas branches/worktrees quantas forem úteis, com slugs funcionais distintos e arquivos/responsabilidades registrados.
- **Implementação:** ativar uma tarefa; concluir, validar e commitar. Ela continua ativa enquanto seu PR aguarda gates/revisão; só a integração libera a fila.
- **Sincronização:** após cada merge de PR, atualizar a próxima branch pendente com `origin/develop`, resolver qualquer conflito antes de ativá-la e repetir os gates.
- **PR:** abrir um PR por funcionalidade, base `develop`. Manter apenas um PR da fila em implementação/revisão; merge só com gate aprovado.
- **Produção:** PR `develop → master`, checks completos, revisão da compatibilidade de migrations e aprovação humana.

`make preMerge TARGET=develop` valida a branch commitada; CI repete os gates no commit do PR. Os scripts não fazem merge, push forçado, reset destrutivo nem deploy automático. A promoção comprova que `origin/master` é ancestral do candidato e não perde alterações.
