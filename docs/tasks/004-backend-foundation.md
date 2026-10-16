# Tarefa 004 — Fundação do backend

- **Branch:** `feature/004-backend-foundation`
- **Base:** `origin/develop` em `939c42c`
- **Responsável:** orchestrator (Codex)
- **Status:** em andamento
- **PR:** ainda não aberto

## Objetivo

Implementar o primeiro bloco executável do backend: bootstrap NestJS em TypeScript estrito, configuração validada, endpoint de prontidão e integração ORM com o schema PostgreSQL existente. Banco local, migration inicial, seed e permissões PostgreSQL já existem em `develop`; esta tarefa não os recria nem altera migrations aplicadas.

## Arquivos sob responsabilidade

- `backend/package.json`, `backend/package-lock.json` e configuração de TypeScript/lint/build;
- `backend/src/` para bootstrap, configuração, prontidão e adapter Prisma;
- `database/prisma/schema.prisma` como mapeamento da migration existente;
- `backend/Dockerfile` para o contrato da imagem definido em `docs/14-infraestrutura-e-acessos.md`;
- `docs/04-arquitetura-e-dados.md`, `docs/07-scripts-e-ambiente.md` e `README.md` somente para refletir capacidades implementadas.

## Dependências

- Migration existente `20261016000100_initial` e executor nativo de `make migrate`.
- Contrato HTTP em `docs/05-api.md` e regras de infraestrutura em `docs/14-infraestrutura-e-acessos.md`.
- Próximas tarefas dependem desta fundação: autenticação (`005`), pedidos (`006`), filtros/edição/exclusão (`007`), cache e instrumentação (`008`).

## Aceite

- `make check` instala via lockfile e executa lint, typecheck e build;
- configuração inválida encerra o bootstrap sem imprimir valores sensíveis;
- `/health/ready` retorna 200 somente com banco acessível e 503 sem detalhes internos quando indisponível;
- Prisma mapeia as tabelas e colunas existentes sem introduzir um segundo executor de migrations;
- imagem escuta em `0.0.0.0:3000`, executa sem root e trata SIGTERM;
- README e documentos afetados identificam explicitamente o que segue pendente;
- integração HTTP real, autenticação e pedidos não são declarados prontos nesta tarefa.

## Validação e evidências

- **Planejada:** `make check`, `make docsCheck` e revisão do diff.
- **Integração HTTP:** pendente para as próximas tarefas; o gate `make integration` continua reprovado até existir a suíte obrigatória.
- **Scripts de criação de branch/worktree:** `make startTask` / `scripts/git/start-task.sh` ainda ausentes; branch criada manualmente a partir de `origin/develop`.
- **PR:** pendente.

## Histórico incremental

- 2026-10-16: tarefa registrada na branch `feature/004-backend-foundation`, baseada em `origin/develop`.
