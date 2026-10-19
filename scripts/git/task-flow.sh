#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Uso: make taskActivate TICKET=<id> | make taskRelease TICKET=<id> | make taskStatus
Várias tarefas podem ficar ativas ao mesmo tempo, cada uma no próprio worktree.
A ativação recusa arquivos já reservados por outra tarefa ativa.
HELP
}

action="${1:-}"
ticket="${TICKET:-}"
if [[ "$action" == --help ]]; then usage; exit 0; fi
root="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo 'ERRO: execute dentro de um worktree Git.'; exit 1; }
common_dir="$(git rev-parse --git-common-dir)"
[[ "$common_dir" = /* ]] || common_dir="$root/$common_dir"
common_dir="$(cd "$common_dir" && pwd)"
registry="$common_dir/task-flow-active"
mutex="$common_dir/task-flow-active.lock"
locked=0

release_mutex() {
  [[ "$locked" == 1 ]] || return 0
  rmdir "$mutex" 2>/dev/null || true
  locked=0
}
claim_mutex() {
  local attempt=0
  mkdir -p "$registry"
  while ! mkdir "$mutex" 2>/dev/null; do
    attempt=$((attempt + 1))
    [[ "$attempt" -lt 100 ]] || { echo 'ERRO: registro de tarefas ocupado.'; exit 1; }
    sleep 0.05
  done
  locked=1
}
trap release_mutex EXIT

owned_files() {
  local task_path="$1"
  awk '
    /^## Arquivos sob responsabilidade/ { capture = 1; next }
    /^## / { capture = 0 }
    capture && /^- `/ {
      line = $0
      sub(/^- `/, "", line)
      sub(/`.*/, "", line)
      if (line != "") print line
    }
  ' "$task_path"
}

paths_overlap() {
  local left="$1" right="$2"
  [[ "$left" == "$right" || "$left" == "$right"/* || "$right" == "$left"/* ]]
}

case "$action" in
  status)
    found=0
    if [[ -d "$registry" ]]; then
      for record in "$registry"/*; do
        [[ -f "$record" ]] || continue
        [[ "$(basename "$record")" =~ ^[A-Za-z0-9]+$ ]] || continue
        cat "$record"
        printf '\n'
        found=1
      done
    fi
    [[ "$found" == 1 ]] || echo 'Nenhuma tarefa ativa.'
    ;;
  activate)
    [[ "$ticket" =~ ^[A-Za-z0-9]+$ ]] || { echo 'ERRO: informe TICKET alfanumérico.'; exit 1; }
    branch="$(git branch --show-current)"
    [[ "$branch" =~ ^(feature|fix)/$ticket-[a-z0-9]+(-[a-z0-9]+)*$ ]] || {
      echo "ERRO: o worktree atual deve estar na branch feature/$ticket-... ou fix/$ticket-... ."; exit 1;
    }
    task_path="$root/docs/tasks/$ticket.md"
    [[ -f "$task_path" ]] || { echo "ERRO: docs/tasks/$ticket.md não existe."; exit 1; }
    [[ -z "$(git status --porcelain)" ]] || { echo 'ERRO: registre o plano da tarefa e deixe o worktree limpo antes de ativar.'; exit 1; }
    files=()
    while IFS= read -r file || [[ -n "$file" ]]; do
      [[ -n "$file" ]] || continue
      files+=("$file")
    done < <(owned_files "$task_path")
    [[ "${#files[@]}" -gt 0 ]] || { echo 'ERRO: a tarefa precisa listar arquivos sob responsabilidade.'; exit 1; }
    for file in "${files[@]}"; do
      [[ "$file" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ && "$file" != *..* && "/$file/" != */./* ]] || {
        echo 'ERRO: a lista exige caminhos relativos canônicos: sem ./, //, barra final, espaços ou .. .'; exit 1;
      }
    done
    git fetch origin
    git merge-base --is-ancestor origin/develop HEAD || {
      echo 'ERRO: atualize esta branch com origin/develop antes de ativar.' >&2
      exit 1
    }
    claim_mutex
    if [[ -f "$registry/$ticket" ]]; then
      echo "ERRO: a tarefa $ticket já está ativa." >&2
      exit 1
    fi
    for record in "$registry"/*; do
      [[ -f "$record" ]] || continue
      [[ "$(basename "$record")" =~ ^[A-Za-z0-9]+$ ]] || continue
      while IFS= read -r reserved || [[ -n "$reserved" ]]; do
        [[ "$reserved" == file=* ]] || continue
        reserved="${reserved#file=}"
        [[ "$reserved" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ && "$reserved" != *..* && "/$reserved/" != */./* ]] || {
          echo 'ERRO: reserva existente contém caminho não canônico; libere e registre a tarefa novamente.' >&2
          exit 1
        }
        for file in "${files[@]}"; do
          if paths_overlap "$file" "$reserved"; then
            other="$(basename "$record")"
            echo "ERRO: $file já está reservado pela tarefa ativa $other." >&2
            exit 1
          fi
        done
      done < "$record"
    done
    record_tmp="$(mktemp "$registry/.tmp.XXXXXX")"
    {
      printf 'ticket=%s\nbranch=%s\nworktree=%s\n' "$ticket" "$branch" "$root"
      for file in "${files[@]}"; do printf 'file=%s\n' "$file"; done
    } > "$record_tmp"
    mv "$record_tmp" "$registry/$ticket"
    echo "Tarefa $ticket ativada em $branch. Outras tarefas com arquivos distintos podem ser ativadas ao mesmo tempo."
    ;;
  release)
    [[ "$ticket" =~ ^[A-Za-z0-9]+$ ]] || { echo 'ERRO: informe TICKET alfanumérico.'; exit 1; }
    branch="$(git branch --show-current)"
    [[ -z "$(git status --porcelain)" ]] || { echo 'ERRO: faça commit ou descarte explicitamente as alterações antes de liberar.'; exit 1; }
    git fetch origin
    claim_mutex
    [[ -f "$registry/$ticket" ]] || { echo 'ERRO: essa tarefa não está ativa.'; exit 1; }
    active_branch="$(sed -n 's/^branch=//p' "$registry/$ticket" | head -n 1)"
    [[ "$active_branch" == "$branch" ]] || { echo 'ERRO: somente o worktree da tarefa ativa pode liberá-la.'; exit 1; }
    git merge-base --is-ancestor HEAD origin/develop || {
      echo 'ERRO: mantenha a tarefa ativa até o PR ser integrado em origin/develop.' >&2
      exit 1
    }
    rm "$registry/$ticket"
    echo "Tarefa $ticket liberada. As outras tarefas ativas permanecem reservadas."
    ;;
  *) usage >&2; exit 2 ;;
esac
