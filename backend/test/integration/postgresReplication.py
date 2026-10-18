#!/usr/bin/env python3
"""Exercise physical streaming on two isolated, disposable PostgreSQL containers."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/db'))
import replication


def main():
    suffix = uuid.uuid4().hex[:10]
    os.environ.update(ENV='test', PGHOST='127.0.0.1', PGPORT='5432', PGUSER='postgres',
                      PGDATABASE='naporta_test_replication_' + suffix,
                      PGPASSWORD=secrets.token_urlsafe(32), REPLICATION_PASSWORD=secrets.token_urlsafe(32))
    env, command = replication.configuration()
    results = []
    report = ROOT / 'artifacts/replication-integration.json'
    report.parent.mkdir(exist_ok=True)

    def check(label, passed):
        if not passed:
            raise ValueError(label)
        results.append({'scenario': label, 'passed': True})
        print('OK: ' + label, flush=True)

    def sql(service, query):
        return replication.sql(command, env, service, query)

    def wait_for(query, expected):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if sql('standby', query) == expected:
                return True
            time.sleep(0.25)
        return False

    failed = None
    try:
        replication.run(command + ['up', '-d', '--wait', '--wait-timeout', '120'], env)
        check('primary role', sql('primary', 'SELECT pg_is_in_recovery();') == 'f')
        check('standby role', sql('standby', 'SELECT pg_is_in_recovery();') == 't')
        container = replication.run(command + ['ps', '-q', 'primary'], env)
        operations_env = dict(env, DB_CONTAINER=container)
        for operation in ('migrate', 'seed'):
            replication.run([sys.executable, str(ROOT / 'scripts/db/database.py'), operation], operations_env)
            check('native executor ' + operation + ' on primary', True)
        migration_lsn = sql('primary', 'SELECT pg_current_wal_lsn();')
        check('application schema WAL visibility barrier', wait_for(
            "SELECT pg_last_wal_replay_lsn() >= '" + migration_lsn + "'::pg_lsn;", 't'))
        check('migration ledger propagates', sql('primary', 'SELECT count(*) FROM public._naporta_migrations;') ==
              sql('standby', 'SELECT count(*) FROM public._naporta_migrations;'))
        check('seed order relationships and decimal precision propagate', sql('standby',
              "SELECT o.number || '|' || c.document || '|' || a.postal_code || '|' || i.price::text "
              "FROM public.orders o JOIN public.order_customers c ON c.order_id=o.id "
              "JOIN public.order_addresses a ON a.order_id=o.id "
              "JOIN public.order_items i ON i.order_id=o.id "
              "WHERE o.public_id='00000000-0000-4000-8000-000000000001';") ==
              'DEMO-0001|DEMO-0001|01001000|49.90')
        check('auth schema propagates', sql('standby',
              "SELECT to_regclass('public.users') IS NOT NULL AND to_regclass('public.login_attempts') IS NOT NULL;") == 't')
        sql('primary', "INSERT INTO public.users(public_id,email,password_hash) VALUES "
            "('00000000-0000-4000-8000-000000000007','replication@example.invalid','synthetic-not-login-hash');")
        auth_lsn = sql('primary', 'SELECT pg_current_wal_lsn();')
        check('auth data WAL visibility barrier', wait_for(
            "SELECT pg_last_wal_replay_lsn() >= '" + auth_lsn + "'::pg_lsn;", 't'))
        check('auth synthetic row propagates', sql('standby',
              "SELECT email FROM public.users WHERE public_id='00000000-0000-4000-8000-000000000007';") ==
              'replication@example.invalid')
        sql('primary', 'CREATE TABLE replication_probe (id integer PRIMARY KEY, value text); INSERT INTO replication_probe VALUES (1,\'synthetic\');')
        # Wait for replay LSN first, so querying a newly created relation is safe.
        lsn = sql('primary', 'SELECT pg_current_wal_lsn();')
        check('WAL visibility barrier', wait_for("SELECT pg_last_wal_replay_lsn() >= '" + lsn + "'::pg_lsn;", 't'))
        check('write propagation', sql('standby', 'SELECT value FROM replication_probe WHERE id=1;') == 'synthetic')
        status = replication.run([sys.executable, str(ROOT / 'scripts/db/replication.py'), 'status'], env)
        check('status exposes streaming and lag', json.loads(status)['replication'][0]['state'] == 'streaming')
        try:
            sql('standby', "INSERT INTO replication_probe VALUES (2,'rejected');")
            rejected = False
        except ValueError:
            rejected = True
        check('standby rejects writes', rejected)
        sql('standby', 'SELECT pg_wal_replay_pause();')
        sql('primary', "UPDATE replication_probe SET value='after-pause' WHERE id=1;")
        lsn = sql('primary', 'SELECT pg_current_wal_lsn();')
        check('paused replay exposes stale read', sql('standby', 'SELECT value FROM replication_probe WHERE id=1;') == 'synthetic')
        check('lag signal detects unseen WAL', sql('standby', "SELECT pg_wal_lsn_diff('" + lsn + "'::pg_lsn,pg_last_wal_replay_lsn()) > 0;") == 't')
        sql('standby', 'SELECT pg_wal_replay_resume();')
        check('replay catches up', wait_for('SELECT value FROM replication_probe WHERE id=1;', 'after-pause'))
        replication.run(command + ['stop', 'standby'], env)
        check('primary remains writable without replica', sql('primary', "INSERT INTO replication_probe VALUES (3,'available'); SELECT count(*) FROM replication_probe;") == '2')
        replication.run(command + ['up', '-d', '--wait', '--wait-timeout', '120', 'standby'], env)
        check('existing standby resumes propagation', wait_for('SELECT count(*) FROM replication_probe;', '2'))
        replication.run(command + ['stop', 'primary'], env)
        check('primary outage never promotes standby', sql('standby', 'SELECT pg_is_in_recovery();') == 't')
        check('standby serves existing reads during primary outage', sql('standby', 'SELECT count(*) FROM replication_probe;') == '2')
        replication.run(command + ['up', '-d', '--wait', '--wait-timeout', '120', 'primary'], env)
        check('primary recovers without role change', sql('primary', 'SELECT pg_is_in_recovery();') == 'f')
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        failed = str(error) if isinstance(error, ValueError) else type(error).__name__
        print('ERRO: ' + failed, file=sys.stderr)
    finally:
        try:
            replication.run(command + ['down', '--volumes'], env)
        except (ValueError, OSError, subprocess.SubprocessError):
            failed = failed or 'cleanup failed'
        report.write_text(json.dumps({'passed': failed is None, 'results': results, 'error': failed}, indent=2) + '\n')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
