\set ON_ERROR_STOP on
\getenv app_password APP_PASSWORD
\getenv migrator_password MIGRATOR_PASSWORD
SELECT current_database() ~ '^naporta_(local|demo)(_[a-z0-9]+)*$' AS allowed_database,
       length(:'app_password') >= 12 AS password_valid,
       length(:'migrator_password') >= 12 AS migrator_password_valid,
       COALESCE((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false) AS is_admin
\gset
\if :allowed_database
\else
  DO $$ BEGIN RAISE EXCEPTION 'Ambiente local/demo inválido'; END $$;
\endif
\if :password_valid
\else
  DO $$ BEGIN RAISE EXCEPTION 'APP_PASSWORD precisa ter ao menos 12 caracteres'; END $$;
\endif
\if :migrator_password_valid
\else
  DO $$ BEGIN RAISE EXCEPTION 'MIGRATOR_PASSWORD precisa ter ao menos 12 caracteres'; END $$;
\endif
\if :is_admin
\else
  DO $$ BEGIN RAISE EXCEPTION 'A inicialização de roles exige a role administrativa local'; END $$;
\endif
BEGIN;
SELECT format('CREATE ROLE naporta_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD %L', :'migrator_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naporta_migrator')
\gexec
ALTER ROLE naporta_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD :'migrator_password';
GRANT CONNECT ON DATABASE :"DBNAME" TO naporta_migrator;
GRANT CREATE, USAGE ON SCHEMA public TO naporta_migrator;
ALTER ROLE naporta_migrator SET search_path = public, pg_catalog;
SELECT format('CREATE ROLE naporta_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 60 PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naporta_app')
\gexec
ALTER ROLE naporta_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 60 PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"DBNAME" TO naporta_app;
GRANT USAGE ON SCHEMA public TO naporta_app;
ALTER ROLE naporta_app SET search_path = public, pg_catalog;
ALTER ROLE naporta_app SET statement_timeout = '5s';
ALTER ROLE naporta_app SET lock_timeout = '2s';
ALTER ROLE naporta_app SET idle_in_transaction_session_timeout = '10s';
SELECT 'CREATE ROLE naporta_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naporta_reader')
\gexec
COMMIT;
