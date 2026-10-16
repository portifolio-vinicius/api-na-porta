#!/usr/bin/env python3
"""Isolated local/test/demo streaming replication; never promotes or deletes data."""
import argparse
import json
import os
import re
import subprocess
import sys
from database import Postgres, ROOT


def configuration():
    connection = Postgres()
    env = dict(os.environ)
    env['POSTGRES_IMAGE'] = (ROOT / 'config/postgres-image.txt').read_text().strip()
    # Restriction makes pgpass generation unambiguous without shell/SQL interpolation.
    for key in ('PGPASSWORD', 'REPLICATION_PASSWORD'):
        if not re.fullmatch(r'[A-Za-z0-9_-]{24,128}', env.get(key, '')):
            raise ValueError(key + ' deve ter 24–128 caracteres URL-safe.')
    project = 'naporta-replica-' + connection.database.replace('_', '-')
    command = ['docker', 'compose', '--project-name', project, '--file',
               str(ROOT / 'database/replication/compose.yml')]
    return env, command


def run(command, env, query=None):
    result = subprocess.run(command, env=env, input=query, text=True, capture_output=True, timeout=180)
    if result.returncode:
        raise ValueError('Operação de replicação falhou; saída ' + str(result.returncode) + '.')
    return result.stdout.strip()


def sql(command, env, service, query):
    return run(command + ['exec', '-T', service, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1',
                          '-U', env['PGUSER'], '-d', env['PGDATABASE'], '-f', '-'], env, query)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('init', 'status', 'down'))
    args = parser.parse_args()
    try:
        env, command = configuration()
        if args.operation == 'init':
            run(command + ['up', '-d', '--wait', '--wait-timeout', '120'], env)
            print('Primário e standby prontos; volumes preservados.')
        elif args.operation == 'down':
            run(command + ['down'], env)
            print('Replicação parada; volumes preservados.')
        else:
            primary = sql(command, env, 'primary', "SELECT pg_is_in_recovery();")
            standby = sql(command, env, 'standby', "SELECT pg_is_in_recovery();")
            rows = sql(command, env, 'primary', "SELECT json_build_object('state',state,'syncState',sync_state,'lagBytes',pg_wal_lsn_diff(pg_current_wal_lsn(),replay_lsn)) FROM pg_stat_replication;")
            if primary != 'f' or standby != 't' or not rows:
                raise ValueError('Papéis ou conexão de streaming inválidos.')
            peers = [json.loads(row) for row in rows.splitlines()]
            print(json.dumps({'primaryInRecovery': False, 'standbyInRecovery': True, 'replication': peers}))
            if not all(peer['state'] == 'streaming' for peer in peers):
                raise ValueError('Standby ainda não está em streaming.')
        return 0
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('ERRO: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
