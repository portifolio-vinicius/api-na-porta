#!/usr/bin/env python3
"""Real PostgreSQL integration of database scripts, with disposable container and synthetic data."""
import json
import os
from pathlib import Path
import secrets
import socket
import shutil
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[3]
results = []


def execute(command, env, *, text=None, expected=True):
    process = subprocess.run(command, cwd=ROOT, env=env, input=text, text=True, capture_output=True, timeout=150)
    if not expected and command[0] == 'make' and 'Traceback' in process.stderr:
        raise RuntimeError('Erro operacional não sanitizado')
    if (process.returncode == 0) != expected:
        # Test credentials and SQL payloads stay out of failure output.
        detail = process.stderr.strip() if command[0] == 'make' else 'client failed'
        raise RuntimeError('Unexpected operation result: ' + ' '.join(command[:3]) + '; ' + detail)
    return process


def main():
    name = 'naporta-db-test-' + uuid.uuid4().hex[:10]
    env = dict(os.environ, ENV='test', PGHOST='127.0.0.1', PGPORT='5432', PGUSER='postgres',
               PGDATABASE='naporta_test_source', PGSSLMODE='disable', DB_CONTAINER=name,
               POSTGRES_USER='postgres', POSTGRES_DB='naporta_test_source', DB_CONFIRM='', BACKUP_FILE='', MIGRATION='')
    env['PGPASSWORD'] = env['POSTGRES_PASSWORD'] = secrets.token_urlsafe(32)
    image = (ROOT / 'config/postgres-image.txt').read_text().strip()
    started = False
    report_path = ROOT / 'artifacts/database-integration.json'
    report_path.parent.mkdir(exist_ok=True)
    if report_path.exists():
        report_path.unlink()
    with tempfile.TemporaryDirectory(prefix='naporta-db-integration-') as tmp:
        directory = Path(tmp)
        env['MIGRATIONS_DIR'] = str(directory / 'migrations')
        shutil.copytree(ROOT / 'database/prisma/migrations', env['MIGRATIONS_DIR'])

        def sql(query, custom=None):
            connection = dict(env, **(custom or {}))
            return execute(['docker', 'exec', '-i', '--env', 'PGPASSWORD', name, 'psql', '-XqAt',
                            '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', connection['PGDATABASE'], '-f', '-'],
                           connection, text=query).stdout.strip()

        def operation(target, label, *, success=True, custom=None):
            connection = dict(env, **(custom or {}))
            output = execute(['make', target], connection, expected=success)
            results.append(dict(scenario=label,passed=True,exitCode=output.returncode,expectedSuccess=success))
            print('OK: ' + label, flush=True)
            return output

        def assertion(label, actual):
            if not actual:
                raise RuntimeError(label)
            results.append(dict(scenario=label,passed=True))
            print('OK: ' + label, flush=True)

        try:
            execute(['docker', 'run', '-d', '--name', name, '--label', 'naporta.integration=true', '--network', 'none',
                     '--tmpfs', '/var/lib/postgresql:rw,nosuid,noexec,size=512m',
                     '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER', '--env', 'POSTGRES_DB', image], env)
            started = True
            for attempt in range(60):
                result = subprocess.run(['docker','exec','--env','PGPASSWORD',name,'psql','-XqAt','-h','127.0.0.1','-p','5432','-U','postgres','-d',env['PGDATABASE'],'-c','SELECT 1;'],env=env,capture_output=True)
                if result.returncode == 0:
                    break
                time.sleep(.5)
            else:
                raise RuntimeError('PostgreSQL readiness timeout')
            version = sql('SHOW server_version;')
            print('PostgreSQL real: ' + version, flush=True)
            operation('migrate','migration em banco limpo')
            operation('migrate','migration repetida idempotente')
            assertion('histórico contém uma migration', sql('SELECT count(*) FROM _naporta_migrations;') == '1')
            operation('dbStatus','consulta do histórico')
            operation('seed','seed fictício')
            sql("INSERT INTO orders(public_id,number,expected_delivery_date) VALUES ('00000000-0000-4000-8000-000000000099','000099','2026-12-01');")
            operation('seed','seed repetido preserva dados externos')
            assertion('seed mantém um item e dois pedidos',sql('SELECT (SELECT count(*) FROM order_items)||\':\'||(SELECT count(*) FROM orders);') == '1:2')
            for bad_env in ('production','prod',''):
                operation('migrate','ambiente bloqueado: '+(bad_env or 'ausente'),success=False,custom={'ENV':bad_env})
            operation('backup','banco fora do namespace bloqueado',success=False,custom={'PGDATABASE':'postgres'})
            operation('migrate','host obrigatório',success=False,custom={'PGHOST':''})
            base_backup=directory/'base.dump'
            operation('backup','backup custom real',custom={'BACKUP_FILE':str(base_backup)})
            assertion('backup e manifesto privados',base_backup.stat().st_mode & 0o777 == 0o600 and Path(str(base_backup)+'.json').stat().st_mode & 0o777 == 0o600)
            operation('backup','sobrescrita de backup bloqueada',success=False,custom={'BACKUP_FILE':str(base_backup)})
            operation('rollback','confirmação de rollback obrigatória',success=False,custom={'MIGRATION':'20261016000100_initial','BACKUP_FILE':str(base_backup)})
            operation('rollback','schema inicial com dados preservado',success=False,custom={'MIGRATION':'20261016000100_initial','DB_CONFIRM':env['PGDATABASE'],'BACKUP_FILE':str(base_backup)})
            assertion('rollback recusado mantém pedidos',sql('SELECT count(*) FROM orders;')=='2')
            # A real structural change; the reverse operation explicitly rejects populated new fields.
            second=Path(env['MIGRATIONS_DIR'])/'20261016000200_add_reference';second.mkdir()
            (second/'migration.sql').write_text('ALTER TABLE public.orders ADD COLUMN reference text;')
            (second/'rollback.sql').write_text("DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.orders WHERE reference IS NOT NULL) THEN RAISE EXCEPTION 'Populated reference'; END IF; END $$; ALTER TABLE public.orders DROP COLUMN reference;")
            operation('migrate','alteração incremental da modelagem')
            assertion('modelagem preserva dados',sql('SELECT count(*) FROM orders;')=='2')
            backup=directory/'current.dump'
            operation('backup','backup após alteração de estrutura',custom={'BACKUP_FILE':str(backup)})
            rollback=dict(MIGRATION=second.name,DB_CONFIRM=env['PGDATABASE'],BACKUP_FILE=str(backup))
            operation('rollback','backup obrigatório para rollback',success=False,custom=dict(rollback,BACKUP_FILE=''))
            operation('rollback','backup de estado anterior bloqueado',success=False,custom=dict(rollback,BACKUP_FILE=str(base_backup)))
            operation('rollback','somente última migration pode ser revertida',success=False,custom=dict(rollback,MIGRATION='20261016000100_initial'))
            sql("UPDATE orders SET reference='synthetic' WHERE number='DEMO-0001';")
            operation('rollback','reversão com perda de dados bloqueada pelo plano',success=False,custom=rollback)
            sql('UPDATE orders SET reference=NULL;')
            operation('rollback','rollback estrutural transacional',custom=rollback)
            assertion('rollback preserva pedidos e remove coluna',sql("SELECT (SELECT count(*) FROM orders)||':'||(SELECT count(*) FROM information_schema.columns WHERE table_name='orders' AND column_name='reference');")=='2:0')
            operation('migrate','reaplicação após rollback')
            applied=second/'migration.sql';original=applied.read_text();applied.write_text(original+'\n-- checksum drift\n')
            operation('migrate','edição de migration aplicada bloqueada',success=False)
            applied.write_text(original)
            broken=Path(env['MIGRATIONS_DIR'])/'20261016000300_broken';broken.mkdir()
            (broken/'migration.sql').write_text('CREATE TABLE public.partial_fixture(id integer); SELECT missing_column FROM public.orders;')
            operation('migrate','migration com erro reprova execução',success=False)
            assertion('erro reverte DDL e histórico',sql("SELECT to_regclass('public.partial_fixture') IS NULL AND NOT EXISTS(SELECT 1 FROM _naporta_migrations WHERE name='20261016000300_broken');")=='t')
            shutil.rmtree(broken)
            sql('CREATE DATABASE naporta_test_restored;')
            destination={'PGDATABASE':'naporta_test_restored','DB_CONFIRM':'naporta_test_restored','BACKUP_FILE':str(backup)}
            operation('restore','confirmação de restore obrigatória',success=False,custom=dict(destination,DB_CONFIRM='wrong'))
            operation('restore','restauração real em banco vazio',custom=destination)
            assertion('restore recupera dados, precisão e relações',sql("SELECT (SELECT count(*) FROM orders)||':'||(SELECT price::text FROM order_items)||':'||(SELECT count(*) FROM order_addresses);",destination)=='2:49.90:1')
            assertion('restore preserva zeros iniciais',sql("SELECT number FROM orders WHERE number='000099';",destination)=='000099')
            assertion('restore recupera histórico de modelagem',sql('SELECT count(*) FROM _naporta_migrations;',destination)=='2')
            operation('restore','restore em banco não vazio bloqueado',success=False,custom=destination)
            before=backup.read_bytes();backup.write_bytes(before+b'corruption')
            operation('restore','backup corrompido bloqueado',success=False,custom=destination)
            operation('rollback','rollback com backup corrompido bloqueado',success=False,custom=rollback)
            backup.write_bytes(before)
            metadata_path=Path(str(backup)+'.json');metadata_original=metadata_path.read_text()
            metadata_path.write_text('[]')
            operation('restore','manifesto malformado rejeitado sem traceback',success=False,custom=destination)
            metadata_path.write_text(metadata_original)
            operation('rollback','backup de outro destino bloqueado',success=False,custom=dict(rollback,PGDATABASE='naporta_test_restored',DB_CONFIRM='naporta_test_restored'))
            concurrency=Path(env['MIGRATIONS_DIR'])/'20261016000300_concurrent';concurrency.mkdir()
            (concurrency/'migration.sql').write_text('SELECT pg_sleep(1); CREATE TABLE public.concurrent_fixture(id integer);')
            (concurrency/'rollback.sql').write_text('DROP TABLE public.concurrent_fixture;')
            first=subprocess.Popen(['make','migrate'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            second_process=subprocess.Popen(['make','migrate'],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            first.communicate(timeout=120);second_process.communicate(timeout=120)
            assertion('migrations concorrentes serializadas',first.returncode==0 and second_process.returncode==0 and sql("SELECT count(*) FROM _naporta_migrations WHERE name='20261016000300_concurrent';")=='1')
            failed_file=directory/'failed.dump'
            operation('backup','falha de conexão reprova backup',success=False,custom={'PGPORT':'1','BACKUP_FILE':str(failed_file)})
            assertion('backup falho não publica arquivo',not failed_file.exists() and not Path(str(failed_file)+'.json').exists())
            sql('CREATE DATABASE naporta_test_empty;')
            empty={'PGDATABASE':'naporta_test_empty','DB_CONFIRM':'naporta_test_empty',
                   'MIGRATIONS_DIR':'','BACKUP_FILE':str(directory/'empty.dump'),
                   'MIGRATION':'20261016000100_initial'}
            operation('migrate','schema inicial em segundo banco vazio',custom=empty)
            operation('backup','backup para reversão de schema vazio',custom=empty)
            operation('rollback','reversão inicial sem dados',custom=empty)
            assertion('reversão inicial remove somente estrutura da aplicação',sql("SELECT to_regclass('public.orders') IS NULL AND (SELECT count(*) FROM _naporta_migrations)=0;",empty)=='t')
            operation('migrate','schema inicial reaplicado após reversão completa',custom=empty)
            # A separate Compose project exercises persistent dev volumes without touching user data.
            suffix = uuid.uuid4().hex[:10]
            with socket.socket() as available:
                available.bind(('127.0.0.1',0)); host_port = available.getsockname()[1]
            compose_env = dict(env,PGDATABASE='naporta_test_compose'+suffix,
                               DB_CONTAINER='naporta-compose-'+suffix,DB_PORT=str(host_port),
                               MIGRATIONS_DIR=str(ROOT/'database/prisma/migrations'))
            project = 'naporta-' + compose_env['PGDATABASE'].replace('_','-')
            compose = ['docker','compose','--project-name',project,'--file',str(ROOT/'database/compose.yml')]
            compose_env['POSTGRES_IMAGE'] = image
            try:
                operation('dbUp','Compose inicia PostgreSQL isolado',custom=compose_env)
                operation('migrate','migration via banco do Compose',custom=compose_env)
                operation('seed','seed via banco do Compose',custom=compose_env)
                operation('dbDown','Compose para preservando volume',custom=compose_env)
                volume = project + '_postgres_data'
                inspected = execute(['docker','volume','inspect',volume],compose_env)
                assertion('volume de dados preservado após dbDown',inspected.returncode==0)
                operation('dbUp','Compose reinicia banco existente',custom=compose_env)
                persisted = execute(['docker','exec','-i','--env','PGPASSWORD',compose_env['DB_CONTAINER'],
                                     'psql','-XqAt','-U','postgres','-d',compose_env['PGDATABASE'],
                                     '-c','SELECT count(*) FROM orders;'],compose_env)
                assertion('reinício preserva pedido sem duplicação',persisted.stdout.strip()=='1')
                operation('dbDown','Compose encerra sem exigir senha de conexão',custom=dict(compose_env,PGPASSWORD=''))
            finally:
                # Remove only the uniquely named volumes belonging to this integration run.
                subprocess.run([*compose,'down','--volumes'],env=compose_env,cwd=ROOT,
                               stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=120,check=True)
            report=dict(valid=True,postgresVersion=version,image=image,results=results)
            artifacts=ROOT/'artifacts';artifacts.mkdir(exist_ok=True)
            (artifacts/'database-integration.json').write_text(json.dumps(report,indent=2)+'\n')
            print(f'{len(results)} verificações PostgreSQL aprovadas.',flush=True)
        finally:
            if started:
                subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError,OSError,subprocess.SubprocessError) as error:
        print('ERRO: integração PostgreSQL: '+str(error),file=sys.stderr)
        sys.exit(1)
