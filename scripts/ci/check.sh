#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
export METRICS_DIR="${METRICS_DIR:-artifacts/performance/current}"
status=0
for stage in pipelineCheck taskPlan check security integration routeReport docsCheck; do
  printf '\n=== %s ===\n' "$stage"
  if make "$stage"; then printf 'APROVADO: %s\n' "$stage"; else status=1; printf 'REPROVADO: %s\n' "$stage"; fi
done
exit "$status"
