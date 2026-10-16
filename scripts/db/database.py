#!/usr/bin/env python3
"""PostgreSQL operations through native libpq clients or docker exec; no shell SQL interpolation."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import select
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
LOCK = 72617001
NAME = re.compile(r'[0-9]{14}_[a-z][a-z0-9_]*\Z')


def fail(message):
    raise ValueError(message)


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b''):
            value.update(chunk)
    return value.hexdigest()


class Postgres:
    def __init__(self):
        environment = os.environ.get('ENV', '')
        if environment not in ('local', 'test', 'demo'):
            fail('ENV obrigatório: local, test ou demo. Produção não é um destino permitido.')
        self.database = os.environ.get('PGDATABASE', '')
        if not re.fullmatch('naporta_' + environment + r'(?:_[a-z0-9]+)*', self.database):
            fail('PGDATABASE deve corresponder a naporta_<ENV> ou naporta_<ENV>_<sufixo>.')
        for name in ('PGHOST', 'PGPORT', 'PGUSER'):
            if not os.environ.get(name):
                fail(name + ' obrigatório; configure a conexão explicitamente.')
        if not os.environ['PGPORT'].isdigit() or not 1 <= int(os.environ['PGPORT']) <= 65535:
            fail('PGPORT inválido.')
        self.env = {k: v for k, v in os.environ.items() if not k.startswith('PG')}
        allowed = ('PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'PGSSLMODE',
                   'PGSSLROOTCERT', 'PGSSLCERT', 'PGSSLKEY', 'PGPASSFILE')
        self.env.update({k: os.environ[k] for k in allowed if os.environ.get(k)})
        self.env.update(PGCONNECT_TIMEOUT='5', PGOPTIONS='-c statement_timeout=60000 -c lock_timeout=5000',
                        PGAPPNAME='naporta-database-operations')
        self.container = os.environ.get('DB_CONTAINER', '')
        if self.container and not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]*', self.container):
            fail('DB_CONTAINER inválido.')

    def command(self, tool, args):
        if self.container:
            if not shutil.which('docker'):
                fail('Docker ausente.')
            command = ['docker', 'exec', '-i']
            for name in sorted(self.env):
                if name.startswith('PG'):
                    command.extend(['--env', name])
            return [*command, self.container, tool, *args]
        if not shutil.which(tool):
            fail('Cliente PostgreSQL ausente: ' + tool)
        return [tool, *args]

    def run(self, tool, args, *, text=None, stdin=None, stdout=None):
        result = subprocess.run(self.command(tool, args), env=self.env,
                                input=text.encode() if text is not None else None,
                                stdin=stdin, stdout=stdout or subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
        if result.returncode:
            # Client errors may include query values or credentials; expose only the operation and SQLSTATE.
            state = re.search(rb'ERROR:\s+([0-9A-Z]{5})\b', result.stderr)
            suffix = '; SQLSTATE ' + state[1].decode() if state else ''
            fail(tool + ' falhou (saída ' + str(result.returncode) + ')' + suffix + '.')
        return result.stdout

    def sql(self, text):
        return self.run('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '-'], text=text).decode().strip()

    def confirm(self):
        if os.environ.get('DB_CONFIRM') != self.database:
            fail('DB_CONFIRM deve ser exatamente o PGDATABASE do destino.')

    def identity(self):
        return {key: self.env[key] for key in ('PGHOST', 'PGPORT', 'PGDATABASE')}

    @contextmanager
    def schema_lock(self):
        """Hold a session advisory lock while pg_dump runs in a second connection."""
        process = subprocess.Popen(self.command('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-f', '-']),
                                   env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                   stderr=subprocess.DEVNULL, bufsize=0)
        try:
            process.stdin.write(f"SELECT pg_advisory_lock({LOCK}); SELECT 'naporta-lock-ready';\n".encode())
            deadline = time.monotonic() + 65
            output = b''
            while b'naporta-lock-ready\n' not in output:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not select.select([process.stdout], [], [], remaining)[0]:
                    fail('Timeout ao adquirir lock de backup.')
                chunk = os.read(process.stdout.fileno(), 4096)
                if not chunk:
                    fail('Conexão de lock de backup interrompida.')
                output += chunk
            yield
        finally:
            process.stdin.close()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill(); process.wait()
            process.stdout.close()


def migrations():
    directory = Path(os.environ.get('MIGRATIONS_DIR') or ROOT / 'database/prisma/migrations')
    if not directory.is_dir():
        fail('Diretório de migrations ausente.')
    result = []
    for path in sorted(directory.iterdir()):
        if not path.is_dir():
            continue
        if not NAME.fullmatch(path.name):
            fail('Nome de migration inválido.')
        up = path / 'migration.sql'; down = path / 'rollback.sql'
        if not up.is_file() or not up.read_text().strip():
            fail('migration.sql ausente ou vazio.')
        body = up.read_text(); reverse = down.read_text() if down.is_file() else None
        for sql in (body, reverse):
            if sql and re.search(r'^\s*\\|\b(?:COMMIT|ROLLBACK|START\s+TRANSACTION)\b', sql, re.I | re.M):
                fail('Migration contém controle de transação ou comando psql; a transação pertence ao executor.')
        checksum = hashlib.sha256((body + '\0' + (reverse or '')).encode()).hexdigest()
        result.append(dict(name=path.name, checksum=checksum, up=body, down=reverse))
    if not result:
        fail('Nenhuma migration disponível.')
    return result


def block(body):
    tag = '$naporta_' + hashlib.sha256(body.encode()).hexdigest()[:16] + '$'
    while tag in body:
        tag = tag[:-1] + '_$'
    return 'DO ' + tag + ' BEGIN\n' + body + '\nEND ' + tag + ';\n'


def preamble():
    return f"SET standard_conforming_strings = on; SELECT pg_advisory_xact_lock({LOCK});\n"


def ledger():
    return '''CREATE TABLE IF NOT EXISTS public._naporta_migrations (
name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());\n'''


def validate(items):
    sql = block("IF EXISTS (SELECT 1 FROM public._naporta_migrations WHERE name NOT IN (" +
                ','.join(literal(item['name']) for item in items) + ")) THEN RAISE EXCEPTION 'Unknown migration'; END IF;")
    for item in items:
        name = literal(item['name']); checksum = literal(item['checksum'])
        sql += block(f"IF EXISTS (SELECT 1 FROM public._naporta_migrations WHERE name={name} AND checksum<>{checksum}) THEN RAISE EXCEPTION 'Migration checksum mismatch'; END IF;\n"
                     f"IF NOT EXISTS (SELECT 1 FROM public._naporta_migrations WHERE name={name}) AND EXISTS (SELECT 1 FROM public._naporta_migrations WHERE name>{name}) THEN RAISE EXCEPTION 'Migration history is not a prefix'; END IF;")
    return sql


def state_sql():
    return "SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'checksum',checksum) ORDER BY name),'[]'::jsonb) FROM public._naporta_migrations;"


def state(pg):
    if pg.sql("SELECT to_regclass('public._naporta_migrations') IS NOT NULL;") != 't':
        return []
    return json.loads(pg.sql(state_sql()))


def backup_path(required=False):
    value = os.environ.get('BACKUP_FILE')
    if required and not value:
        fail('BACKUP_FILE obrigatório.')
    path = Path(value) if value else ROOT / 'artifacts/backups' / (time.strftime('%Y%m%dT%H%M%S', time.gmtime()) + '-' + uuid.uuid4().hex[:8] + '.dump')
    if path.suffix != '.dump':
        fail('BACKUP_FILE deve terminar em .dump.')
    return path.resolve()


def verify_backup(pg=None):
    path = backup_path(required=True)
    metadata = json.loads(Path(str(path) + '.json').read_text())
    if not isinstance(metadata, dict):
        fail('Manifesto de backup deve ser um objeto JSON.')
    if metadata.get('format') != 'pg_dump-custom-v1' or metadata.get('sha256') != digest(path) or metadata.get('bytes') != path.stat().st_size:
        fail('Backup inválido: formato, checksum ou tamanho divergente.')
    if pg and metadata.get('source') != pg.identity():
        fail('Backup pertence a outro destino PostgreSQL.')
    return path, metadata


def migrate(pg):
    items = migrations()
    sql = preamble() + ledger() + validate(items)
    for item in items:
        name, checksum = literal(item['name']), literal(item['checksum'])
        sql += block(f"IF NOT EXISTS (SELECT 1 FROM public._naporta_migrations WHERE name={name}) THEN\nEXECUTE {literal(item['up'])};\nINSERT INTO public._naporta_migrations(name,checksum) VALUES ({name},{checksum});\nEND IF;")
    pg.sql('BEGIN;\n' + sql + 'COMMIT;')
    print('Migrations aplicadas ou já presentes; histórico e checksums válidos.')


def rollback(pg):
    pg.confirm()
    items = migrations(); target = os.environ.get('MIGRATION', '')
    item = next((item for item in items if item['name'] == target), None)
    if not item or not item['down']:
        fail('MIGRATION obrigatório com rollback.sql versionado.')
    _, metadata = verify_backup(pg)
    sql = preamble() + ledger() + validate(items)
    expected = literal(json.dumps(metadata.get('migrations')))
    sql += block(f"IF (SELECT COALESCE(jsonb_agg(jsonb_build_object('name',name,'checksum',checksum) ORDER BY name),'[]'::jsonb) FROM public._naporta_migrations)<>{expected}::jsonb THEN RAISE EXCEPTION 'Backup migration state differs'; END IF;\n"
                 f"IF (SELECT max(name) FROM public._naporta_migrations) IS DISTINCT FROM {literal(target)} THEN RAISE EXCEPTION 'Only the latest applied migration can be rolled back'; END IF;")
    sql += item['down'] + '\nDELETE FROM public._naporta_migrations WHERE name=' + literal(target) + ';\n'
    pg.sql('BEGIN;\n' + sql + 'COMMIT;')
    print('Última migration revertida em transação; backup validado.')


def backup(pg):
    path = backup_path(); meta_path = Path(str(path) + '.json')
    if path.exists() or meta_path.exists():
        fail('Destino de backup já existe; selecione outro arquivo.')
    path.parent.mkdir(parents=True, exist_ok=True)
    published = []
    with tempfile.TemporaryDirectory(prefix='.naporta-backup-', dir=path.parent) as tmp:
        archive = Path(tmp) / 'archive'; manifest = Path(tmp) / 'manifest'
        try:
            with pg.schema_lock():
                history = state(pg)
                with archive.open('xb') as file:
                    os.chmod(archive, 0o600)
                    pg.run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges'], stdout=file)
                if history != state(pg):
                    fail('Histórico mudou durante backup.')
                metadata = dict(format='pg_dump-custom-v1', source=pg.identity(), migrations=history,
                                sha256=digest(archive), bytes=archive.stat().st_size,
                                timestamp=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
            manifest.write_text(json.dumps(metadata, indent=2) + '\n'); manifest.chmod(0o600)
            # Hard links publish each file exclusively, without overwriting an existing backup.
            for src, dst in ((archive, path), (manifest, meta_path)):
                os.link(src, dst); published.append(dst)
        except BaseException:
            for file in published:
                file.unlink()
            raise
    print('Backup criado: ' + str(path))


def restore(pg):
    pg.confirm(); path, _ = verify_backup()
    # pg_restore emits SQL; psql applies emptiness assertion and restore under the same transaction/lock.
    with tempfile.TemporaryFile() as sql:
        sql.write(preamble().encode())
        sql.write(block("IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_') OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') THEN RAISE EXCEPTION 'Restore requires an empty database'; END IF;").encode())
        sql.flush()
        with path.open('rb') as archive:
            pg.run('pg_restore', ['--no-owner', '--no-privileges', '--file=-'], stdin=archive, stdout=sql)
        sql.seek(0)
        pg.run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '--single-transaction', '-f', '-'], stdin=sql)
    print('Backup restaurado em destino vazio; transação concluída.')


def seed(pg):
    items = migrations()
    body = (ROOT / 'database/seeds/demo.sql').read_text()
    guard = block(f"IF NOT EXISTS (SELECT 1 FROM public._naporta_migrations WHERE name={literal(items[-1]['name'])}) THEN RAISE EXCEPTION 'Apply all migrations before seed'; END IF;")
    pg.sql('BEGIN;\n' + preamble() + ledger() + validate(items) + guard + body + '\nCOMMIT;')
    print('Seed fictício aplicado sem modificar registros existentes.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('status', 'migrate', 'rollback', 'backup', 'restore', 'seed'))
    args = parser.parse_args()
    try:
        pg = Postgres()
        if args.operation == 'status':
            print(json.dumps(dict(database=pg.database, applied=state(pg)), indent=2))
        else:
            globals()[args.operation](pg)
        return 0
    except (ValueError, OSError, subprocess.SubprocessError, BrokenPipeError) as error:
        # Operational errors are sanitized; never print PostgreSQL stderr or environment values.
        message = str(error) if type(error) is ValueError else type(error).__name__
        print('ERRO: ' + message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
