#!/bin/sh
set -eu
mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
chmod 700 "$PGDATA"
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  # Refuse partial/nonempty data; operators must inspect failed initialization.
  if [ -n "$(ls -A "$PGDATA")" ]; then
    echo 'Standby destination is not empty; refusing initialization.' >&2
    exit 1
  fi
  # Password restricted to URL-safe generated characters by the host wrapper.
  umask 077
  printf 'primary:5432:*:naporta_replication:%s\n' "$REPLICATION_PASSWORD" > /var/lib/postgresql/replication.pgpass
  chown postgres:postgres /var/lib/postgresql/replication.pgpass
  export PGPASSFILE=/var/lib/postgresql/replication.pgpass PGCONNECT_TIMEOUT=5
  gosu postgres pg_basebackup -h primary -U naporta_replication -D "$PGDATA" -R -X stream --checkpoint=fast --no-password
fi
if [ ! -f "$PGDATA/standby.signal" ]; then
  echo 'Existing volume is not a standby; refusing to start.' >&2
  exit 1
fi
exec gosu postgres postgres -c hot_standby=on
