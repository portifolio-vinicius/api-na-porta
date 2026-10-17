#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "${1:-}" == --help ]]; then
  echo 'Uso: make up (ENV, PG* administrativos, role passwords, URLs da API, JWT e usuário fictício são obrigatórios).'
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo 'ERRO: make up não aceita argumentos; veja make help.' >&2
  exit 1
fi
ENV="${ENV:-}"
if [[ "$ENV" != local && "$ENV" != demo ]]; then
  echo 'ERRO: ENV deve ser local ou demo.' >&2
  exit 1
fi
for name in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE APP_PASSWORD MIGRATOR_PASSWORD API_DATABASE_URL MIGRATOR_API_URL JWT_SECRET JWT_ISSUER JWT_AUDIENCE DEMO_USER_EMAIL DEMO_USER_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERRO: $name é obrigatório." >&2
    exit 1
  fi
done
if [[ "$PGDATABASE" != "naporta_$ENV" && "$PGDATABASE" != "naporta_${ENV}_"* ]]; then
  echo 'ERRO: PGDATABASE não corresponde ao ambiente selecionado.' >&2
  exit 1
fi
if [[ "$PGUSER" != postgres ]]; then
  echo 'ERRO: PGUSER deve ser postgres para inicializar o banco local; o script troca para naporta_migrator após criar as roles.' >&2
  exit 1
fi
python3 - <<'PY'
import os
from urllib.parse import unquote, urlparse

database = os.environ['PGDATABASE']
for name, user in (('API_DATABASE_URL', 'naporta_app'), ('MIGRATOR_API_URL', 'naporta_migrator')):
    value = urlparse(os.environ[name])
    if value.scheme not in ('postgres', 'postgresql') or value.hostname != 'db' or value.path != '/' + database:
        raise SystemExit(f'ERRO: {name} deve apontar para db/{database}.')
    if value.username != user or not value.password:
        raise SystemExit(f'ERRO: {name} deve usar a role {user} e senha não vazia.')
    expected = os.environ['APP_PASSWORD' if user == 'naporta_app' else 'MIGRATOR_PASSWORD']
    if unquote(value.password) != expected:
        raise SystemExit(f'ERRO: senha de {name} não corresponde à senha da role.')
PY
POSTGRES_IMAGE="$(cat "$ROOT/config/postgres-image.txt")"
DB_CONTAINER="${DB_CONTAINER:-naporta-${PGDATABASE//_/-}-db}"
BACKEND_LOCAL_IMAGE="${BACKEND_LOCAL_IMAGE:-naporta-backend:${PGDATABASE//_/-}}"
export POSTGRES_IMAGE DB_CONTAINER BACKEND_LOCAL_IMAGE

bash "$ROOT/scripts/db/up.sh"
bash "$ROOT/scripts/db/local-access.sh" roles
PGUSER=naporta_migrator
PGPASSWORD="$MIGRATOR_PASSWORD"
export PGUSER PGPASSWORD
bash "$ROOT/scripts/db/migrate.sh"
bash "$ROOT/scripts/db/local-access.sh" grants
bash "$ROOT/scripts/db/seed.sh"
project="naporta-${PGDATABASE//_/-}"
docker compose --project-name "$project" \
  --file "$ROOT/database/compose.yml" \
  --file "$ROOT/backend/compose.yml" \
  build api
docker compose --project-name "$project" \
  --file "$ROOT/database/compose.yml" \
  --file "$ROOT/backend/compose.yml" \
  run --rm demo-user
docker compose --project-name "$project" \
  --file "$ROOT/database/compose.yml" \
  --file "$ROOT/backend/compose.yml" \
  up -d --wait api
