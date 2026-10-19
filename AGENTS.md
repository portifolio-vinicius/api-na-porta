# Instruções gerais

A raiz define o processo comum. `backend/AGENTS.md` e `database/AGENTS.md` definem responsabilidades locais. O projeto mantém esses três arquivos com o nome `AGENTS.md`.

- A leitura começa em [docs/README.md](docs/README.md) e nos trechos relacionados à tarefa.
- Requisitos e decisões têm fonte única em `docs/`. As instruções apontam para essas fontes.
- Cada tarefa registra escopo, responsável, dependências, arquivos e evidências em `docs/tasks/<ticket>.md`.
- O coordenador organiza dependências e contratos compartilhados. Várias funcionalidades podem ser implementadas ao mesmo tempo, cada uma no próprio worktree; ative a tarefa no fluxo 06 e mantenha arquivos distintos entre tarefas ativas.
- Cada arquivo compartilhado tem um único responsável por tarefa; não atribua o mesmo arquivo a funcionalidades em implementação distintas.
- Features e correções partem de `origin/develop` atualizado, em worktree próprio.
- Branches seguem `feature/<ticket>-<descricao>` ou `fix/<ticket>-<descricao>`.
- Alterações entram em `develop` por PR. A promoção para `master` também usa PR.
- A integração depende do gate aprovado e das [regras efetivas](docs/09-ci-e-seguranca.md).
- Make e scripts versionados concentram as automações repetidas. [Makefile](Makefile) lista os alvos disponíveis.
- `make help` apresenta comandos. `make taskPlan TARGET=develop` produz o plano conservador.
- `make validateFlow TARGET=develop` verifica o fluxo com árvore limpa. `make preMerge TARGET=develop` valida o candidato commitado.
- Automações pendentes seguem o [catálogo](docs/07-scripts-e-ambiente.md). Comandos Git manuais seguem o [procedimento de worktree](docs/06-fluxo-de-desenvolvimento.md).
- O contexto contém o diff, os contratos afetados e as evidências relevantes. Uma alteração nas fontes invalida seus resumos anteriores.
- A documentação muda somente onde a tarefa afeta contratos, decisões ou estado operacional.
- Segredos permanecem no ambiente privado. Fixtures e artefatos publicados contêm dados fictícios ou técnicos sanitizados.
- A entrega informa comandos, resultados reais e pendências. O [estado executável](docs/13-esteiras-executaveis.md) distingue implementação, bloqueios e planejamento.
