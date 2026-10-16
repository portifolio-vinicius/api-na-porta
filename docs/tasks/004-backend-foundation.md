# Tarefa 004 — Backend API em blocos

- **Branch:** `feature/004-backend-api`
- **Base:** `origin/develop` em `939c42c`
- **Responsável:** orchestrator (Codex)
- **Status:** em andamento
- **PR:** ainda não aberto

## Objetivo

Implementar o backend em blocos pequenos, com commits por entrega, preservando as migrations existentes e mantendo explícito o que ainda não passou pelos gates.

## Arquivos sob responsabilidade

- `backend/package.json`, `backend/package-lock.json` e configuração de TypeScript/lint/build;
- `backend/src/` para bootstrap, configuração, autenticação, pedidos e adapters;
- `database/prisma/schema.prisma` como mapeamento das migrations SQL;
- migrations novas somente para tabelas exigidas pelas funcionalidades;
- `backend/Dockerfile` para o contrato da imagem definido em `docs/14-infraestrutura-e-acessos.md`;
- `docs/04-arquitetura-e-dados.md`, `docs/07-scripts-e-ambiente.md` e `README.md` somente para refletir capacidades implementadas.

## Dependências

- Migration existente `20261016000100_initial` e executor nativo de `make migrate`.
- Contrato HTTP em `docs/05-api.md` e regras de infraestrutura em `docs/14-infraestrutura-e-acessos.md`.
- Base existente: migration inicial, seed de pedido, Compose PostgreSQL, executor/backup/restore e Swarm em `develop`.
- Sequência no branch: (1) bootstrap/Prisma/Docker, commit `a52a25e`; (2) login JWT e usuário fictício, commit `a95b948`; (3) criar/listar/detalhar pedidos com filtros e paginação; (4) editar e excluir logicamente; (5) cache por arquivos e métricas; (6) integração HTTP exigida antes do merge.

## Aceite

- todas as rotas e comportamentos dos documentos 03/05 implementados e cobertos pela integração do documento 08;
- banco, migrations, seed, roles e aplicação mantêm contratos consistentes;
- Make/Docker Compose local executa banco, migrations, seed e API com cache de arquivos;
- checks de qualidade, segurança, integração e documentação aprovados no candidato atual;
- README e documentos afetados identificam explicitamente o que segue pendente;
- integração HTTP real, autenticação e pedidos não são declarados prontos nesta tarefa.

## Validação e evidências

- **Bloco 1 aprovado:** `make check`, `npm --prefix backend audit` (0 vulnerabilidades), `make docsCheck` e `git diff --check`.
- **Bloco 2 concluído:** login JWT/Argon2id, limiter compartilhado, migration e seed de usuário (`a95b948`).
- **Bloco 3 implementado:** POST, GET lista com filtros/paginação e GET detalhe; `make check` aprovado.
- **Bloco 2 validado:** `make check`, `npm --prefix backend audit` (0 vulnerabilidades), `make docsCheck` (25 arquivos, 0 erros), `git diff --check`.
- **Não executado:** integração HTTP, `infraCheck`, segurança completa e build/scan da imagem do backend.
- O gate `make integration` permanece reprovado até existir a suíte HTTP obrigatória e todos os cenários passarem.
- **Scripts de criação de branch/worktree:** `make startTask` / `scripts/git/start-task.sh` ainda ausentes; branch criada manualmente a partir de `origin/develop`.
- **PR:** pendente.

## Histórico incremental

- 2026-10-16: tarefa registrada na branch `feature/004-backend-api`, baseada em `origin/develop` (`939c42c`).
- 2026-10-16: bloco 1 implementado nos commits `6f1a512` e `a52a25e`: bootstrap NestJS, schema Prisma, prontidão PostgreSQL e Dockerfile.
- 2026-10-16: bloco 2 implementa login JWT, limiter compartilhado, migration e seed fictício; checks estáticos aprovados. Integração DB/HTTP e `infraCheck` ainda não foram executados.
- 2026-10-16: bloco 3 implementa criação, listagem, filtros e detalhe de pedidos; checks de build/typecheck passaram. Integração HTTP continua pendente.
