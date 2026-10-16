#!/usr/bin/env python3
"""Start/stop only the development PostgreSQL service; preserve its named data volume."""
import argparse
import os
import subprocess
import sys
from database import Postgres, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('up', 'down'))
    args = parser.parse_args()
    try:
        connection = Postgres()  # Validate explicit environment and database namespace before Compose.
        env = dict(os.environ)
        env['POSTGRES_IMAGE'] = (ROOT / 'config/postgres-image.txt').read_text().strip()
        env['DB_CONTAINER'] = connection.container or 'naporta-' + connection.database.replace('_','-') + '-db'
        if args.operation == 'up' and not env.get('PGPASSWORD'):
            raise ValueError('PGPASSWORD obrigatório para inicializar PostgreSQL.')
        if args.operation == 'down' and not env.get('PGPASSWORD'):
            env['PGPASSWORD'] = 'unused-for-down'
        port = env.get('DB_PORT', '5432')
        if not port.isdigit() or not 1 <= int(port) <= 65535:
            raise ValueError('DB_PORT inválido.')
        command = ['docker', 'compose', '--project-name', 'naporta-' + connection.database.replace('_', '-'),
                   '--file', str(ROOT / 'database/compose.yml')]
        command += ['up', '-d', '--wait', 'db'] if args.operation == 'up' else ['down']
        result = subprocess.run(command, env=env, timeout=180)
        return result.returncode
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('ERRO: ' + (str(error) if type(error) is ValueError else type(error).__name__), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
