#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "${1:-}" == --help ]]; then
  echo 'Uso: make logs SERVICE=api|db PGDATABASE=naporta_local|naporta_demo.'
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo 'ERRO: make logs não aceita argumentos; veja make help.' >&2
  exit 1
fi
PGDATABASE="${PGDATABASE:-}"
SERVICE="${SERVICE:-api}"
if [[ ! "$PGDATABASE" =~ ^naporta_(local|demo)(_[a-z0-9]+)*$ ]]; then
  echo 'ERRO: PGDATABASE deve identificar um ambiente local ou demo.' >&2
  exit 1
fi
if [[ "$SERVICE" != api && "$SERVICE" != db ]]; then
  echo 'ERRO: SERVICE deve ser api ou db.' >&2
  exit 1
fi
POSTGRES_IMAGE="$(cat "$ROOT/config/postgres-image.txt")"
DB_CONTAINER="${DB_CONTAINER:-naporta-${PGDATABASE//_/-}-db}"
PGUSER="${PGUSER:-unused-for-logs}"
PGPASSWORD="${PGPASSWORD:-unused-for-logs}"
export POSTGRES_IMAGE DB_CONTAINER PGUSER PGPASSWORD PGDATABASE
project="naporta-${PGDATABASE//_/-}"
docker compose --project-name "$project" \
  --file "$ROOT/database/compose.yml" \
  --file "$ROOT/backend/compose.yml" \
  logs --follow --tail=100 "$SERVICE"
