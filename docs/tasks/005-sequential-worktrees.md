# Tarefa 005 — Fila sequencial de funcionalidades

- **Branch:** `feature/005-fluxo-sequencial-worktrees`
- **Base:** `origin/develop` em `939c42c`
- **Responsável:** orchestrator
- **Status:** em andamento
- **PR:** pendente

## Objetivo

Permitir preparar várias branches/worktrees com nomes ligados às funcionalidades, enquanto a implementação de código ocorre uma funcionalidade por vez e a fila se integra sequencialmente em `develop`.

## Arquivos sob responsabilidade

- `AGENTS.md`
- `Makefile`
- `scripts/git/start-task.sh`
- `scripts/git/task-flow.sh`
- `docs/06-fluxo-de-desenvolvimento.md`
- `docs/07-scripts-e-ambiente.md`
- `docs/10-eficiencia-e-documentacao.md`
- `docs/14-publicacao-e-protecao.md`
- `docs/README.md`
- `docs/tasks/005-sequential-worktrees.md`

## Aceite

- Várias tarefas podem ser planejadas com worktrees separados, cada branch nomeada `feature/<ticket>-<slug>` ou `fix/<ticket>-<slug>`.
- A automação mantém somente uma tarefa ativa por clone e libera a próxima somente depois da integração da tarefa atual em `develop`.
- Cada tarefa registra os arquivos sob sua responsabilidade; a próxima branch atualiza `origin/develop` antes de ativação.
- O fluxo documenta como as features acumulam em `develop` por PRs sequenciais, sem push/merge direto.
- As limitações do bloqueio manual/local ficam explícitas.

## Validação e evidências

- `bash -n` nos scripts alterados, `make help`, `make docsCheck` e `git diff --check`.
- Não executar a fila de múltiplos worktrees neste commit; os comandos operacionais requerem cenário de uso real posterior.
- O gate de integração HTTP permanece independente e pendente no backend.
