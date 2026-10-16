#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Uso: make taskActivate TICKET=<id> | make taskRelease TICKET=<id> | make taskStatus
Somente uma tarefa pode estar ativa para implementação entre todos os worktrees deste clone.
HELP
}

action="${1:-}"
ticket="${TICKET:-}"
if [[ "$action" == --help ]]; then usage; exit 0; fi
root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo 'ERRO: execute dentro de um worktree Git.'; exit 1; }
common_dir="$(git rev-parse --git-common-dir)"
[[ "$common_dir" = /* ]] || common_dir="$root/$common_dir"
common_dir="$(cd "$common_dir" && pwd)"
lock_dir="$common_dir/task-flow-active"
owner_file="$lock_dir/owner"

case "$action" in
  status)
    if [[ -f "$owner_file" ]]; then cat "$owner_file"; else echo 'Nenhuma tarefa ativa.'; fi
    ;;
  activate)
    [[ "$ticket" =~ ^[A-Za-z0-9]+$ ]] || { echo 'ERRO: informe TICKET alfanumérico.'; exit 1; }
    branch="$(git branch --show-current)"
    [[ "$branch" =~ ^(feature|fix)/$ticket-[a-z0-9]+(-[a-z0-9]+)*$ ]] || {
      echo "ERRO: o worktree atual deve estar na branch feature/$ticket-... ou fix/$ticket-... ."; exit 1;
    }
    [[ -f "$root/docs/tasks/$ticket.md" ]] || { echo "ERRO: docs/tasks/$ticket.md não existe."; exit 1; }
    [[ -z "$(git status --porcelain)" ]] || { echo 'ERRO: registre o plano da tarefa e deixe o worktree limpo antes de ativar.'; exit 1; }
    git fetch origin
    git merge-base --is-ancestor origin/develop HEAD || {
      echo 'ERRO: atualize esta branch com origin/develop após a integração anterior antes de ativar.' >&2
      exit 1
    }
    mkdir "$lock_dir" 2>/dev/null || {
      active="desconhecida"
      [[ -f "$owner_file" ]] && active="$(sed -n 's/^ticket=//p' "$owner_file" | head -n 1)"
      echo "ERRO: já existe uma tarefa ativa ($active)." >&2
      exit 1
    }
    printf 'ticket=%s\nbranch=%s\nworktree=%s\n' "$ticket" "$branch" "$root" > "$owner_file"
    echo "Tarefa $ticket ativada em $branch. Implemente somente o escopo registrado nessa tarefa."
    ;;
  release)
    [[ "$ticket" =~ ^[A-Za-z0-9]+$ ]] || { echo 'ERRO: informe TICKET alfanumérico.'; exit 1; }
    [[ -f "$owner_file" ]] || { echo 'ERRO: nenhuma tarefa está ativa.'; exit 1; }
    branch="$(git branch --show-current)"
    active_ticket="$(sed -n 's/^ticket=//p' "$owner_file" | head -n 1)"
    active_branch="$(sed -n 's/^branch=//p' "$owner_file" | head -n 1)"
    [[ "$active_ticket" == "$ticket" && "$active_branch" == "$branch" ]] || {
      echo 'ERRO: somente a tarefa ativa pode liberar o bloqueio.'; exit 1;
    }
    [[ -z "$(git status --porcelain)" ]] || { echo 'ERRO: faça commit ou descarte explicitamente as alterações antes de liberar.'; exit 1; }
    git fetch origin
    git merge-base --is-ancestor HEAD origin/develop || {
      echo 'ERRO: mantenha a tarefa ativa até o PR ser integrado em origin/develop.' >&2
      exit 1
    }
    rm "$owner_file"
    rmdir "$lock_dir"
    echo "Tarefa $ticket liberada. Outro worktree pode ser ativado."
    ;;
  *) usage >&2; exit 2 ;;
esac
