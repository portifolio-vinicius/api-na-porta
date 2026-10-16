#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
status=0
for scan in dependencies secrets source container; do
  printf '\nSegurança: %s\n' "$scan"
  if bash "scripts/security/$scan.sh"; then printf 'APROVADO: %s\n' "$scan"; else status=1; printf 'REPROVADO: %s\n' "$scan"; fi
done
exit "$status"
