#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "${1:-}" == --help ]]; then
  echo 'Uso interno: local-access.sh roles|grants (somente ENV local/demo).'
  exit 0
fi
if [[ "${ENV:-}" != local && "${ENV:-}" != demo ]]; then
  echo 'ERRO: ENV deve ser local ou demo.' >&2
  exit 1
fi
if [[ "${1:-}" == roles ]]; then
  if [[ -z "${APP_PASSWORD:-}" || -z "${MIGRATOR_PASSWORD:-}" ]]; then
    echo 'ERRO: APP_PASSWORD e MIGRATOR_PASSWORD são obrigatórios.' >&2
    exit 1
  fi
  export DBNAME="${PGDATABASE:-}"
  psql -X -q -v ON_ERROR_STOP=1 -f "$ROOT/scripts/db/local-roles.sql"
elif [[ "${1:-}" == grants ]]; then
  psql -X -q -v ON_ERROR_STOP=1 -c 'SET ROLE naporta_migrator' -f "$ROOT/database/security/grants.sql"
else
  echo 'ERRO: uso: local-access.sh roles|grants' >&2
  exit 1
fi
