#!/usr/bin/env python3
"""Real local Compose lifecycle; ephemeral credentials and project-owned cleanup."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def main():
    suffix = secrets.token_hex(6)
    database = 'naporta_local_compose_' + suffix
    project = 'naporta-' + database.replace('_', '-')
    password, app_password, migrator_password = (secrets.token_hex(24) for _ in range(3))
    email = 'compose-' + suffix + '@example.test'
    api_port = free_port()
    db_port = free_port()
    while db_port == api_port:
        db_port = free_port()
    env = dict(os.environ)
    env.update({
        'ENV': 'local', 'PGHOST': '127.0.0.1', 'PGPORT': '5432',
        'DB_PORT': str(db_port), 'PGUSER': 'postgres', 'PGPASSWORD': password,
        'PGDATABASE': database, 'DB_CONTAINER': project + '-db',
        'APP_PASSWORD': app_password, 'MIGRATOR_PASSWORD': migrator_password,
        'API_DATABASE_URL': f'postgresql://naporta_app:{app_password}@db:5432/{database}',
        'MIGRATOR_API_URL': f'postgresql://naporta_migrator:{migrator_password}@db:5432/{database}',
        'JWT_SECRET': secrets.token_hex(48), 'JWT_ISSUER': 'compose-integration',
        'JWT_AUDIENCE': 'compose-integration', 'DEMO_USER_EMAIL': email,
        'DEMO_USER_PASSWORD': secrets.token_hex(24), 'API_HOST_PORT': str(api_port),
        'POSTGRES_IMAGE': (ROOT / 'config/postgres-image.txt').read_text().strip(),
        'BACKEND_LOCAL_IMAGE': 'naporta-backend:' + database.replace('_', '-'),
    })
    compose = ['docker', 'compose', '--project-name', project,
               '--file', str(ROOT / 'database/compose.yml'),
               '--file', str(ROOT / 'backend/compose.yml')]

    def command(args, label, timeout=600):
        result = subprocess.run(args, cwd=ROOT, env=env, capture_output=True, timeout=timeout)
        if result.returncode:
            diagnostic = (result.stdout + result.stderr).decode('utf-8', errors='replace')
            if args == ['make', 'up']:
                logs = subprocess.run(compose + ['logs', '--no-color', '--tail', '30', 'api'],
                                      cwd=ROOT, env=env, capture_output=True, timeout=30)
                diagnostic += '\nAPI logs:\n' + logs.stdout.decode('utf-8', errors='replace')
            private_names = ('PGPASSWORD', 'APP_PASSWORD', 'MIGRATOR_PASSWORD', 'API_DATABASE_URL',
                             'MIGRATOR_API_URL', 'JWT_SECRET', 'DEMO_USER_PASSWORD')
            for name in sorted(private_names, key=lambda key: len(env[key]), reverse=True):
                diagnostic = diagnostic.replace(env[name], '[REDACTED]')
            raise RuntimeError(label + ' failed:\n' + diagnostic[-5000:])
        return result.stdout

    def request(path, method='GET', body=None, token=None, expected=200):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        req = Request(f'http://127.0.0.1:{api_port}' + path,
                      data=json.dumps(body).encode() if body is not None else None,
                      headers=headers, method=method)
        try:
            response = urlopen(req, timeout=10)
        except HTTPError as error:
            raise RuntimeError(f'{method} {path} returned {error.code}') from None
        with response:
            if response.status != expected:
                raise RuntimeError(f'{method} {path} unexpected status')
            return json.load(response)

    def ready():
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                if request('/health/ready').get('status') == 'ready':
                    return
            except (RuntimeError, URLError, TimeoutError):
                time.sleep(1)
        raise RuntimeError('API readiness timeout')

    def login():
        return request('/api/v1/auth/login', 'POST', {
            'email': email, 'password': env['DEMO_USER_PASSWORD'],
        })['accessToken']

    stage = 'initial startup'
    try:
        command(['make', 'up'], stage)
        ready()
        print('PASS: make up and readiness')
        stage = 'authentication and persisted order'
        token = login()
        order_number = 'COMPOSE-' + suffix
        created = request('/api/v1/orders', 'POST', {
            'number': order_number, 'expectedDeliveryDate': '2026-12-01',
            'customer': {'name': 'Cliente Fictício Compose', 'document': 'DEMO-COMPOSE'},
            'deliveryAddress': {'street': 'Rua Exemplo', 'number': '1', 'district': 'Centro',
                                'city': 'Cidade Fictícia', 'state': 'SP', 'postalCode': '01001000', 'country': 'BR'},
            'items': [{'description': 'Item Fictício Compose', 'price': '12.34'}],
        }, token, expected=201)
        path = '/api/v1/orders?number=' + order_number
        first = request(path, token=token)
        cache_probe = compose + ['exec', '-T', 'api', 'node', '-e',
            "const fs=require('fs');const d='/var/cache/naporta';const files=fs.readdirSync(d,{recursive:true}).filter(f=>f.endsWith('.json')).sort();if(!files.length)process.exit(1);console.log(JSON.stringify(files.map(f=>[f,fs.statSync(d+'/'+f).mtimeMs])))"]
        cache_before = command(cache_probe, 'real cache population')
        second = request(path, token=token)
        cache_after = command(cache_probe, 'cache hit verification')
        assert first == second and first['meta']['total'] == 1
        assert second['data'][0]['id'] == created['id']
        assert cache_before == cache_after, 'Repeated list rewrote cache instead of hitting it'
        print('PASS: login, create and repeated list with real file cache')
        stage = 'shutdown and restart persistence'
        command(['make', 'down'], stage)
        remaining = command(compose + ['ps', '--quiet'], 'shutdown verification')
        assert not remaining.strip(), 'Containers remained after make down'
        command(['make', 'up'], 'restart')
        ready()
        token = login()
        persisted = request('/api/v1/orders/' + created['id'], token=token)
        assert persisted['number'] == order_number and persisted['items'][0]['price'] == '12.34'
        assert request(path, token=token)['data'][0]['id'] == created['id']
        print('PASS: make down/up preserves database and reestablishes login/cache access')
    except (AssertionError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        raise RuntimeError(stage + ': ' + (str(error) if isinstance(error, RuntimeError) else type(error).__name__)) from None
    finally:
        # The generated project is unique; never prune global containers/images/volumes.
        result = subprocess.run(compose + ['down', '--volumes', '--remove-orphans'],
                                cwd=ROOT, env=env, capture_output=True, timeout=120)
        if result.returncode:
            raise RuntimeError('Project-owned cleanup failed; inspect project ' + project)
        subprocess.run(['docker', 'image', 'rm', env['BACKEND_LOCAL_IMAGE']],
                       cwd=ROOT, capture_output=True, timeout=60)
        print('PASS: isolated project resources removed')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as failure:
        print('FAIL: ' + str(failure), file=sys.stderr)
        sys.exit(1)
