#!/usr/bin/env python3
"""Real PostgreSQL integration of controlled demo seed profiles and cache invalidation."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]


def main():
    suffix = uuid.uuid4().hex[:10]
    name = 'naporta-seed-' + suffix
    database = 'naporta_test_seed_' + suffix
    password = secrets.token_urlsafe(32)
    env = dict(os.environ, ENV='test', PGHOST='127.0.0.1', PGPORT='5432', PGUSER='postgres',
               PGDATABASE=database, PGSSLMODE='disable', DB_CONTAINER=name,
               POSTGRES_USER='postgres', POSTGRES_DB=database, POSTGRES_PASSWORD=password,
               PGPASSWORD=password, SEED_PROFILE='full')
    # Never inherit a fixture migration subset from another integration worker.
    env.pop('MIGRATIONS_DIR', None)
    checks = []
    started = False

    def execute(command, *, text=None, custom=None, success=True):
        result = subprocess.run(command, cwd=ROOT, env=dict(env, **(custom or {})), input=text,
                                text=True, capture_output=True, timeout=150)
        if (result.returncode == 0) != success:
            raise RuntimeError('Operação de integração falhou: ' + ' '.join(command[:2]))
        return result.stdout.strip()

    def sql(query):
        return execute(['docker', 'exec', '-i', '--env', 'PGPASSWORD', name, 'psql', '-XqAt',
                        '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database, '-f', '-'], text=query)

    def check(label, condition):
        if not condition:
            raise RuntimeError(label)
        checks.append(label)
        print('OK: ' + label, flush=True)

    try:
        image = (ROOT / 'config/postgres-image.txt').read_text().strip()
        execute(['docker', 'run', '-d', '--name', name, '--network', 'none',
                 '--tmpfs', '/var/lib/postgresql:rw,nosuid,noexec,size=512m', '--env', 'POSTGRES_PASSWORD',
                 '--env', 'POSTGRES_USER', '--env', 'POSTGRES_DB', image])
        started = True
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', '--env', 'PGPASSWORD', name, 'psql', '-XqAt',
                                    '-h', '127.0.0.1', '-U', 'postgres', '-d', database, '-c', 'SELECT 1'],
                                   env=env, capture_output=True, timeout=10)
            if ready.returncode == 0:
                break
            time.sleep(.5)
        else:
            raise RuntimeError('PostgreSQL readiness timeout')
        execute(['make', 'migrate'])
        env.pop('SEED_PROFILE')
        execute(['make', 'seed'])
        check('perfil padrão mantém somente o seed básico', sql('SELECT count(*) FROM orders;') == '1')
        env['SEED_PROFILE'] = 'full'
        sql("INSERT INTO orders(public_id,number,expected_delivery_date) VALUES ('99999999-0000-4000-8000-000000000001','EXTERNAL','2030-01-01');")
        external_before = sql("SELECT row_to_json(o) FROM orders o WHERE number='EXTERNAL';")
        initial_version = int(sql("SELECT version FROM cache_versions WHERE namespace='orders';"))
        execute(['make', 'seed'])
        check('full contém seis pedidos fictícios e preserva externo', sql('SELECT count(*) FROM orders;') == '7')
        check('full contém todos os quatro status', sql('SELECT count(DISTINCT status) FROM orders;') == '4')
        check('full preserva número textual com zeros à esquerda', sql("SELECT number FROM orders WHERE public_id='00000000-0000-4000-8000-000000000010';") == '000042')
        check('full contém pedido logicamente excluído', sql("SELECT count(*) FROM orders WHERE deleted_at IS NOT NULL;") == '1')
        check('full contém datas distintas', int(sql('SELECT count(DISTINCT expected_delivery_date) FROM orders;')) >= 5)
        check('full contém onze itens sem duplicações', sql('SELECT count(*) FROM order_items;') == '11')
        check('valores decimais exatos e preço zero', sql("SELECT string_agg(price::text,',' ORDER BY price) FROM order_items WHERE order_id=(SELECT id FROM orders WHERE number='000042');") == '0.00,123.45')
        check('primeiro seed invalida cache', int(sql("SELECT version FROM cache_versions WHERE namespace='orders';")) == initial_version + 1)
        sql("UPDATE orders SET expected_delivery_date='2028-01-01' WHERE number='000042'; UPDATE order_customers SET name='Cliente fictício editado' WHERE order_id=(SELECT id FROM orders WHERE number='000042'); UPDATE order_items SET price=7.89 WHERE order_id=(SELECT id FROM orders WHERE number='000042') AND price=0;")
        before = sql("SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o),'customers',(SELECT jsonb_agg(to_jsonb(c) ORDER BY order_id) FROM order_customers c),'addresses',(SELECT jsonb_agg(to_jsonb(a) ORDER BY order_id) FROM order_addresses a),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM order_items i));")
        execute(['make', 'seed'])
        after = sql("SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM orders o),'customers',(SELECT jsonb_agg(to_jsonb(c) ORDER BY order_id) FROM order_customers c),'addresses',(SELECT jsonb_agg(to_jsonb(a) ORDER BY order_id) FROM order_addresses a),'items',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM order_items i));")
        check('full repetido preserva integralmente dados e edições', before == after)
        check('externo permanece idêntico', sql("SELECT row_to_json(o) FROM orders o WHERE number='EXTERNAL';") == external_before)
        check('repetição também invalida cache', int(sql("SELECT version FROM cache_versions WHERE namespace='orders';")) == initial_version + 2)
        execute(['make', 'seed'], custom={'SEED_PROFILE': 'invalid'}, success=False)
        check('perfil inválido não altera cache', int(sql("SELECT version FROM cache_versions WHERE namespace='orders';")) == initial_version + 2)
        execute(['make', 'seed'], custom={'SEED_PROFILE': 'basic'})
        check('basic preserva full já existente', sql('SELECT count(*) FROM orders;') == '7')
        check('basic também invalida cache', int(sql("SELECT version FROM cache_versions WHERE namespace='orders';")) == initial_version + 3)
        report = ROOT / 'artifacts/demo-seed-integration.json'
        report.parent.mkdir(exist_ok=True)
        report.write_text(json.dumps({'valid': True, 'checks': checks, 'image': image}, indent=2) + '\n')
        print(f'Integração seed aprovada: {len(checks)} verificações reais.', flush=True)
    finally:
        if started:
            subprocess.run(['docker', 'rm', '-f', '-v', name], env=env, capture_output=True, timeout=60)


if __name__ == '__main__':
    main()
