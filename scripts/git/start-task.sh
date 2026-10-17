#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Uso: make startTask TYPE=feature|fix TICKET=<id> NAME=<slug> FILES=<caminho,caminho> [WORKTREE_PATH=<caminho>]
Cria uma branch baseada em origin/develop e um worktree isolado. Ative com make taskActivate.
Várias tarefas com arquivos distintos podem ficar ativas ao mesmo tempo.
HELP
}

if [[ "${1:-}" == --help ]]; then usage; exit 0; fi
if [[ $# -ne 0 ]]; then echo 'ERRO: use make startTask TYPE=... TICKET=... NAME=... FILES=...'; exit 1; fi

root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo 'ERRO: execute dentro de um repositório Git.'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'ERRO: a árvore de trabalho atual precisa estar limpa.'; exit 1; }

type="${TYPE:-}"
ticket="${TICKET:-}"
name="${NAME:-}"
files="${FILES:-}"
[[ "$type" == feature || "$type" == fix ]] || { echo 'ERRO: TYPE deve ser feature ou fix.'; exit 1; }
[[ "$ticket" =~ ^[A-Za-z0-9]+$ ]] || { echo 'ERRO: TICKET deve conter somente letras e números.'; exit 1; }
[[ "$name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] || { echo 'ERRO: NAME deve ser um slug em minúsculas separado por hífens.'; exit 1; }
[[ -n "$files" ]] || { echo 'ERRO: FILES lista os arquivos/diretórios sob responsabilidade, separados por vírgula.'; exit 1; }

IFS=, read -r -a file_list <<< "$files"
for file in "${file_list[@]}"; do
  [[ "$file" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ && "$file" != *..* && "/$file/" != */./* ]] || {
    echo 'ERRO: FILES exige caminhos relativos canônicos: sem ./, //, barra final, espaços ou .. .' >&2
    exit 1
  }
done

git fetch origin
git rev-parse --verify origin/develop >/dev/null 2>&1 || { echo 'ERRO: origin/develop indisponível.'; exit 1; }
branch="$type/$ticket-$name"
git check-ref-format --branch "$branch" >/dev/null
ticket_branch="$(git for-each-ref --format='%(refname:short)' refs/heads refs/remotes/origin | grep -E "^(feature|fix)/${ticket}-" || true)"
[[ -z "$ticket_branch" ]] || { echo "ERRO: o ticket $ticket já aparece em outra branch: $ticket_branch."; exit 1; }
git show-ref --verify --quiet "refs/heads/$branch" && { echo "ERRO: a branch $branch já existe localmente."; exit 1; }
git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1 && { echo "ERRO: a branch $branch já existe no remoto."; exit 1; }
task_file="docs/tasks/$ticket.md"
existing_task="$(git ls-tree -r --name-only origin/develop -- docs/tasks | awk -F/ '{print $NF}' | grep -E "^${ticket}([.-]|$)" || true)"
[[ -z "$existing_task" ]] || { echo "ERRO: já existe uma tarefa com o ticket $ticket em develop ($existing_task)."; exit 1; }

repo_name="$(basename "$root")"
worktree_path="${WORKTREE_PATH:-$(dirname "$root")/$repo_name-$ticket-$name}"
if [[ -e "$worktree_path" ]]; then echo "ERRO: o caminho $worktree_path já existe."; exit 1; fi
parent="$(dirname "$worktree_path")"
[[ -d "$parent" ]] || { echo 'ERRO: a pasta pai do worktree precisa existir.'; exit 1; }
parent="$(cd "$parent" && pwd)"
worktree_path="$parent/$(basename "$worktree_path")"
base_commit="$(git rev-parse origin/develop)"

git worktree add -b "$branch" "$worktree_path" origin/develop
mkdir -p "$worktree_path/docs/tasks"
{
  printf '# Tarefa %s — %s\n\n' "$ticket" "$name"
  printf -- '- **Branch:** `%s`\n- **Worktree:** `%s`\n- **Base:** `origin/develop` em `%s`\n- **Status:** planejada\n- **Responsável:** orchestrator\n\n' "$branch" "$worktree_path" "$base_commit"
  printf '## Arquivos sob responsabilidade\n\n'
  for file in "${file_list[@]}"; do printf -- '- `%s`\n' "$file"; done
  printf '\n## Objetivo e aceite\n\nPreencher antes de ativar a tarefa.\n\n## Dependências\n\n- Nenhuma identificada; confirmar antes de ativar.\n\n## Validação e PR\n\n- **Validação:** pendente.\n- **PR para develop:** pendente.\n'
} > "$worktree_path/$task_file"

printf 'Tarefa planejada: %s\nBranch: %s\nWorktree: %s\nBase: %s\n' "$ticket" "$branch" "$worktree_path" "$base_commit"
printf 'Revise %s, complete objetivo/aceite e faça o commit inicial antes de ativar.\n' "$task_file"
printf 'Outras funcionalidades podem ser criadas e ativadas em paralelo quando os arquivos não se sobrepõem.\n'
