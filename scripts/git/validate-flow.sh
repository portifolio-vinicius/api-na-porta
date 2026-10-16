#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
case "${TARGET:-develop}" in develop|master) ;; *) fail 'TARGET deve ser develop ou master.' ;; esac
git rev-parse --verify HEAD >/dev/null 2>&1 || fail 'Repositório sem commit inicial.'
[[ -z "$(git status --porcelain)" ]] || fail 'Árvore Git contém alterações não commitadas.'
branch="$(git branch --show-current)"
git rev-parse --verify "origin/$TARGET" >/dev/null 2>&1 || fail "Base origin/$TARGET indisponível; atualize as referências."
if [[ "$TARGET" == master ]]; then
  [[ "$branch" == develop ]] || fail 'Promoção para master exige branch develop.'
  git merge-base --is-ancestor origin/master HEAD || fail 'origin/master não é ancestral do candidato.'
else
  [[ "$branch" =~ ^(feature|fix)/[A-Za-z0-9]+-[a-z0-9]+(-[a-z0-9]+)*$ ]] || fail 'Branch deve seguir feature/<ticket>-<descricao> ou fix/<ticket>-<descricao>.'
  git merge-base --is-ancestor origin/develop HEAD || fail 'Atualize a branch com origin/develop.'
fi
