#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
bash scripts/test/database-integration.sh
backend
script_exists test:integration
docker_ready
[[ -d backend/test ]] || fail 'Testes de integração ausentes em backend/test.'
# Refuse stale artifacts. The backend suite owns isolated DB/cache startup and cleanup.
[[ ! -e "$METRICS_DIR" ]] || fail 'METRICS_DIR já existe; use um diretório novo por execução.'
mkdir -p "$METRICS_DIR"
npm --prefix backend ci --ignore-scripts
export INTEGRATION_PROFILE="${INTEGRATION_PROFILE:-full}"
case "$METRICS_DIR" in /*) ;; *) METRICS_DIR="$ROOT/$METRICS_DIR" ;; esac
export METRICS_DIR
npm --prefix backend run test:integration -- --runInBand --passWithNoTests=false
python3 scripts/metrics/report.py --validate-only
