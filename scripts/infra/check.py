#!/usr/bin/env python3
"""Validate infrastructure in disposable containers; never deploy or initialize Swarm."""
import json
import os
from pathlib import Path
import secrets
import shutil
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
NGINX = 'nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236'
POSTGRES = 'postgres:18-alpine@sha256:77f585114c32fbca283dc835b0596f4e52b51b4c6662d7810b2f4084f60a1873'
prefix = 'naporta-infra-check-' + secrets.token_hex(6)
containers = []
network_created = False
checks = 0


def run(*args, input=None, ok=True, env=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True, cwd=ROOT, env=env)
    if (result.returncode == 0) != ok:
        raise RuntimeError(f'{args[0]} falhou: {result.stderr or result.stdout}')
    return (result.stdout + (result.stderr if args[:2] == ('docker', 'logs') else '')).strip()


def verify(label, condition):
    global checks
    if not condition:
        raise RuntimeError(label)
    checks += 1
    print('OK: ' + label, flush=True)


def start(name, *args):
    container = prefix + '-' + name
    containers.append(container)
    run('docker', 'run', '-d', '--name', container, '--network', prefix, *args)
    return container


def sql(text, ok=True):
    return run('docker', 'exec', '-i', '--user', 'postgres', db, 'psql', '-X', '-U', 'postgres', '-d', 'naporta', '-At', '-v', 'ON_ERROR_STOP=1', input=text, ok=ok)


def request(path, headers=None, https=True):
    url = ('https' if https else 'http') + '://127.0.0.1:' + ports[https] + path
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), context=ssl._create_unverified_context(), timeout=5) as response:
            return response.status, response.read().decode(), response.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode(), error.headers


run('docker', 'info')
for script in list((ROOT / 'scripts/infra').glob('*.sh')) + list((ROOT / 'scripts/db').glob('*.sh')):
    run('bash', '-n', str(script))
run('sh', '-n', str(ROOT / 'infra/swarm/backend-entrypoint.sh'))
env = dict(os.environ, NGINX_IMAGE=NGINX, POSTGRES_IMAGE=POSTGRES, BACKEND_IMAGE=NGINX,
           JWT_ISSUER='fixture', JWT_AUDIENCE='fixture', CORS_ORIGINS='https://example.invalid')
for name in ('TLS_CERT_SECRET', 'TLS_KEY_SECRET', 'DATABASE_URL_SECRET', 'JWT_SECRET_NAME', 'POSTGRES_PASSWORD_SECRET', 'APP_PASSWORD_SECRET', 'MIGRATOR_PASSWORD_SECRET', 'READER_PASSWORD_SECRET'):
    env[name] = 'fixture-' + name.lower()
run('bash', 'scripts/infra/validate.sh', env=env)
verify('Docker aceita manifesto Swarm', True)
run('bash', 'scripts/infra/validate.sh', env=dict(env, API_REPLICAS='5'), ok=False)
run('bash', 'scripts/infra/validate.sh', env=dict(env, BACKEND_IMAGE='backend:latest'), ok=False)
verify('réplicas fora do orçamento e imagens mutáveis são bloqueadas', True)

(ROOT / 'artifacts').mkdir(exist_ok=True)
try:
    with tempfile.TemporaryDirectory(prefix=prefix, dir=ROOT / 'artifacts') as directory:
        tmp = Path(directory)
        # Permitir leitura pelos UIDs não root dos containers.
        tmp.chmod(0o755)
        run('docker', 'network', 'create', '--subnet', '10.42.0.0/24', prefix)
        network_created = True
        for name in ('postgres_password', 'app_password', 'migrator_password', 'reader_password'):
            (tmp / name).write_text(secrets.token_hex(24))
            (tmp / name).chmod(0o444)
        init_dir = tmp / 'initdb'
        init_dir.mkdir(mode=0o755)
        shutil.copyfile(ROOT / 'database/security/init-access.sql', init_dir / '10-access.sql')
        (init_dir / '10-access.sql').chmod(0o444)
        db = start('db', '--tmpfs', '/var/lib/postgresql',
                   '-e', 'POSTGRES_DB=naporta', '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password',
                   '-e', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 --auth-local=peer',
                   '-v', f'{tmp}:/run/secrets:ro',
                   '-v', f'{ROOT / "database/security"}:/opt/naporta:ro',
                   '-v', f'{init_dir}:/docker-entrypoint-initdb.d:ro',
                   POSTGRES, 'postgres', '-c', 'hba_file=/opt/naporta/pg_hba.conf',
                   '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic')
        for _ in range(60):
            if run('docker', 'inspect', '--format', '{{.State.Running}}', db) != 'true':
                raise RuntimeError('Bootstrap PostgreSQL falhou: ' + run('docker', 'logs', db))
            ready = subprocess.run(['docker', 'exec', db, 'pg_isready', '-U', 'postgres', '-d', 'naporta'], capture_output=True)
            if ready.returncode == 0:
                # initdb's temporary server is socket-only; wait for TCP too.
                tcp = subprocess.run(['docker', 'exec', db, 'pg_isready', '-h', '127.0.0.1'], capture_output=True)
                if tcp.returncode == 0:
                    break
            time.sleep(0.5)
        else:
            raise RuntimeError('PostgreSQL não ficou pronto: ' + run('docker', 'logs', db))
        db_env = dict(os.environ, DB_CONTAINER=db, DB_ACCESS_ACTION='roles')
        run('bash', 'scripts/db/access.sh', env=db_env)
        verify('bootstrap e reaplicação idempotente dos roles', True)
        verify('roles sem privilégios administrativos', sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('naporta_app','naporta_reader','naporta_migrator') AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolreplication AND NOT rolbypassrls;") == '3')
        run('bash', 'scripts/db/access.sh', env=dict(db_env, DB_ACCESS_ACTION='grants'), ok=False)
        verify('permissões falham antes das migrations', True)
        sql('SET ROLE naporta_migrator;\n' + (ROOT / 'database/prisma/migrations/20261016000100_initial/migration.sql').read_text())
        for migration in sorted((ROOT / 'database/prisma/migrations').glob('*/migration.sql'))[1:]:
            sql('SET ROLE naporta_migrator;\n' + migration.read_text())
        sql("SET ROLE naporta_migrator; CREATE TABLE public._prisma_migrations(id text); CREATE TABLE public._naporta_migrations(name text); CREATE FUNCTION public.private_function() RETURNS integer LANGUAGE sql AS 'SELECT 1';")
        run('bash', 'scripts/db/access.sh', env=dict(db_env, DB_ACCESS_ACTION='grants'))
        run('bash', 'scripts/db/access.sh', env=dict(db_env, DB_ACCESS_ACTION='grants'))
        verify('grants aplicados e reaplicados após migrations', True)
        sql("SET ROLE naporta_app; INSERT INTO public.orders(public_id,number,expected_delivery_date) VALUES ('00000000-0000-4000-8000-000000000001','fixture',current_date); UPDATE public.orders SET number='updated'; SELECT * FROM public.users;")
        verify('aplicação pode inserir, consultar e atualizar dados permitidos', True)
        for statement in ('CREATE TABLE public.forbidden(id int)', 'DELETE FROM public.orders', 'TRUNCATE public.orders', 'SELECT * FROM public._prisma_migrations', 'SELECT * FROM public._naporta_migrations', "INSERT INTO public.users(password_hash) VALUES ('fixture')", 'SELECT public.private_function()'):
            sql('SET ROLE naporta_app; ' + statement + ';', ok=False)
        verify('aplicação bloqueada para DDL, exclusão física, migrations, escrita em usuários e funções privadas', True)
        sql('SET ROLE naporta_reader; SELECT * FROM public.orders;')
        sql('SET ROLE naporta_reader; SELECT * FROM public.users;', ok=False)
        sql("SET ROLE naporta_reader; INSERT INTO public.orders(number) VALUES ('blocked');", ok=False)
        verify('leitor restrito aos dados de pedidos', True)
        ip = json.loads(run('docker', 'inspect', db))[0]['NetworkSettings']['Networks'][prefix]['IPAddress']
        password = (tmp / 'app_password').read_text()
        run('docker', 'exec', '-e', 'PGPASSWORD=' + password, db, 'psql', '-X', '-h', ip, '-U', 'naporta_app', '-d', 'naporta', '-c', 'SELECT 1')
        run('docker', 'exec', '-e', 'PGPASSWORD=' + password, db, 'psql', '-X', '-h', ip, '-U', 'naporta_app', '-d', 'naporta', '-c', 'SET ROLE naporta_migrator', ok=False)
        verify('sessão autenticada da API não pode assumir o role de migration', True)
        run('docker', 'exec', '-e', 'PGPASSWORD=invalid-fixture', db, 'psql', '-X', '-h', ip, '-U', 'naporta_app', '-d', 'naporta', '-c', 'SELECT 1', ok=False)
        run('docker', 'exec', '-e', 'PGPASSWORD=' + (tmp / 'postgres_password').read_text(), db, 'psql', '-X', '-h', ip, '-U', 'postgres', '-d', 'naporta', '-c', 'SELECT 1', ok=False)
        verify('HBA permite SCRAM do usuário da API e bloqueia senha incorreta e acesso remoto administrativo', True)
        fixture = tmp / 'backend.conf'
        fixture.write_text('events {}\nhttp { server { listen 3000; location / { return 200 "$hostname|$http_x_forwarded_for|$http_x_forwarded_proto"; } } }\n')
        for index in range(2):
            start('backend-' + str(index), '--network-alias', 'tasks.backend', '-v', f'{fixture}:/etc/nginx/nginx.conf:ro', NGINX)
        run('openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', str(tmp / 'tls_key'), '-out', str(tmp / 'tls_cert'))
        (tmp / 'tls_key').chmod(0o444)
        proxy = start('proxy', '--user', '101:101', '--read-only', '--cap-drop', 'ALL', '--tmpfs', '/tmp:mode=1777',
                      '-p', '127.0.0.1::8443', '-p', '127.0.0.1::8080',
                      '-v', f'{ROOT / "infra/nginx/nginx.conf"}:/etc/nginx/nginx.conf:ro', '-v', f'{tmp}:/run/secrets:ro',
                      '--entrypoint', 'nginx', NGINX, '-g', 'daemon off;')
        if run('docker', 'inspect', '--format', '{{.State.Running}}', proxy) != 'true':
            raise RuntimeError('Nginx falhou: ' + run('docker', 'logs', proxy))
        ports = {tls: run('docker', 'port', proxy, port).rsplit(':', 1)[1] for tls, port in ((True, '8443/tcp'), (False, '8080/tcp'))}
        for _ in range(30):
            try:
                if request('/proxy-health', https=False)[0] == 200:
                    break
            except (OSError, urllib.error.URLError):
                pass
            time.sleep(0.2)
        run('docker', 'exec', proxy, 'nginx', '-t')
        verify('Nginx válido, sem root, filesystem somente leitura e sem capabilities', True)
        hosts = set()
        for _ in range(8):
            status, body, headers = request('/api/v1/orders', {'X-Forwarded-For': 'spoofed', 'X-Forwarded-Proto': 'http'})
            verify('HTTPS chega ao upstream', status == 200)
            hostname, address, proto = body.split('|')
            hosts.add(hostname)
            verify('cabeçalhos de origem são sobrescritos', address != 'spoofed' and proto == 'https')
        verify('requisições distribuídas entre duas réplicas', len(hosts) == 2)
        verify('cabeçalhos de segurança presentes', headers.get('Strict-Transport-Security') and headers.get('X-Content-Type-Options') == 'nosniff')
        verify('HTTP público exige HTTPS', request('/api/v1/orders', https=False)[0] == 426)
        verify('rotas não publicadas retornam 404', request('/internal')[0] == 404)
        statuses = [request('/api/v1/auth/login')[0] for _ in range(10)]
        verify('login limitado com resposta 429', 200 in statuses and 429 in statuses)
finally:
    for container in reversed(containers):
        subprocess.run(['docker', 'rm', '-fv', container], capture_output=True)
    if network_created:
        subprocess.run(['docker', 'network', 'rm', prefix], capture_output=True)

print(f'Infraestrutura: {checks} verificações aprovadas; fixtures descartadas. Backend real e Swarm multi-host não foram executados.')
