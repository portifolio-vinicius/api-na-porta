#!/usr/bin/env bash
source "$(dirname "$0")/../common.sh"
docker_ready
[[ "${DB_CONTAINER:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || fail 'Defina DB_CONTAINER com o container PostgreSQL local no nó de dados.'
case "${DB_ACCESS_ACTION:-}" in
  roles)
    # Reaplica permissões e senhas dos secrets montados, sem valores no argv.
    docker exec --user postgres "$DB_CONTAINER" psql -X --no-password -U postgres -d naporta -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/10-access.sql
    ;;
  grants)
    docker exec --user postgres "$DB_CONTAINER" psql -X --no-password -U postgres -d naporta -v ON_ERROR_STOP=1 -c 'SET ROLE naporta_migrator' -f /opt/naporta/grants.sql
    ;;
  *) fail 'DB_ACCESS_ACTION deve ser roles ou grants.' ;;
esac
