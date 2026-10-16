#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "${1:-}" == --help ]]; then
  echo 'Uso: make down PGDATABASE=naporta_local|naporta_demo (preserva os volumes).'
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo 'ERRO: make down não aceita argumentos; veja make help.' >&2
  exit 1
fi
PGDATABASE="${PGDATABASE:-}"
if [[ ! "$PGDATABASE" =~ ^naporta_(local|demo)(_[a-z0-9]+)*$ ]]; then
  echo 'ERRO: PGDATABASE deve identificar um ambiente local ou demo.' >&2
  exit 1
fi
POSTGRES_IMAGE="$(cat "$ROOT/config/postgres-image.txt")"
DB_CONTAINER="${DB_CONTAINER:-naporta-${PGDATABASE//_/-}-db}"
PGUSER="${PGUSER:-unused-for-down}"
PGPASSWORD="${PGPASSWORD:-unused-for-down}"
PGDATABASE="${PGDATABASE}"
export POSTGRES_IMAGE DB_CONTAINER PGUSER PGPASSWORD PGDATABASE
project="naporta-${PGDATABASE//_/-}"
docker compose --project-name "$project" \
  --file "$ROOT/database/compose.yml" \
  --file "$ROOT/backend/compose.yml" \
  down
