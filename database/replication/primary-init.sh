#!/bin/sh
set -eu
# psql reads the password from its environment, never from process arguments.
psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv replication_password REPLICATION_PASSWORD
CREATE ROLE naporta_replication WITH LOGIN REPLICATION PASSWORD :'replication_password';
SQL
printf '\nhost replication naporta_replication all scram-sha-256\n' >> "$PGDATA/pg_hba.conf"
