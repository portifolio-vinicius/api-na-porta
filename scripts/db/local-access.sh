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
export ROOT
export DB_ACCESS_LOCAL_ACTION="${1:-}"
python3 - <<'PYCODE'
import os
from pathlib import Path
import subprocess
import sys
sys.path.insert(0, str(Path(os.environ.get('ROOT', '.')).resolve() / 'scripts/db'))
from database import Postgres, ROOT
try:
    connection = Postgres()
    action = os.environ['DB_ACCESS_LOCAL_ACTION']
    if action not in ('roles', 'grants'):
        raise ValueError('Uso: local-access.sh roles|grants')
    environment = dict(connection.env)
    environment['DBNAME'] = connection.database
    if action == 'roles' and any(not environment.get(key) for key in ('APP_PASSWORD', 'MIGRATOR_PASSWORD')):
        raise ValueError('APP_PASSWORD e MIGRATOR_PASSWORD são obrigatórios.')
    path = ROOT / ('scripts/db/local-roles.sql' if action == 'roles' else 'database/security/grants.sql')
    command = connection.command('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'])
    if connection.container:
        command[3:3] = ['--env', 'DBNAME', '--env', 'APP_PASSWORD', '--env', 'MIGRATOR_PASSWORD']
    result = subprocess.run(command, env=environment, input=path.read_bytes(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    if result.returncode:
        raise ValueError('Falha ao configurar permissões locais; confira role, schema e conexão.')
    print('Permissões locais configuradas: ' + action)
except (ValueError, OSError, subprocess.SubprocessError) as error:
    print('ERRO: ' + (str(error) if isinstance(error, ValueError) else type(error).__name__), file=sys.stderr)
    sys.exit(1)
PYCODE
