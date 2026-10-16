# Tarefa 005 — Funcionalidades paralelas em worktrees

- **Branch:** `feature/005-fluxo-sequencial-worktrees`
- **Base:** `origin/develop` em `939c42c`
- **Responsável:** orchestrator
- **Status:** em revisão
- **PR:** https://github.com/portifolio-vinicius/api-na-porta/pull/5

## Objetivo

Permitir implementar várias funcionalidades ao mesmo tempo. Cada uma tem branch e worktree próprios, criados a partir de `origin/develop`. Tarefas ativas com os mesmos arquivos continuam excluídas.

## Arquivos sob responsabilidade

- `AGENTS.md`
- `Makefile`
- `scripts/git/start-task.sh`
- `scripts/git/task-flow.sh`
- `scripts/ci/validate.py`
- `docs/06-fluxo-de-desenvolvimento.md`
- `docs/07-scripts-e-ambiente.md`
- `docs/10-eficiencia-e-documentacao.md`
- `docs/14-publicacao-e-protecao.md`
- `docs/README.md`
- `docs/tasks/005-sequential-worktrees.md`

## Aceite

- Várias tarefas podem ser criadas com worktrees separados, cada branch nomeada `feature/<ticket>-<slug>` ou `fix/<ticket>-<slug>`.
- Duas ou mais tarefas com arquivos distintos podem ficar ativas ao mesmo tempo.
- `taskActivate` recusa a ativação quando um caminho já está reservado por outra tarefa ativa.
- `taskRelease` libera somente a tarefa cujo commit já entrou em `origin/develop` e mantém as demais reservas.
- Cada tarefa registra os arquivos sob sua responsabilidade e parte de `origin/develop`.
- O fluxo documenta PRs independentes para `develop`, sem push ou merge direto.
- A reserva é local ao clone e não impede edição manual de uma branch inativa.

## Validação e evidências

- `bash -n` nos scripts alterados, `make help`, `make docsCheck` (25 arquivos, 0 erros), `git diff --check` e `python3 scripts/ci/validate.py` (84 verificações, incluindo duas tarefas ativas, bloqueio de arquivo repetido e release no worktree errado).
- Cenários descartáveis adicionais, fora do clone real: entradas inválidas, feature e correção juntas, diretório pai, prefixo textual vizinho, isolamento de edição, branch desatualizada, sincronização depois do merge, tarefa dependente, promoção de develop e reutilização de ticket integrado.
- O gate de integração HTTP permanece independente e pendente no backend.
