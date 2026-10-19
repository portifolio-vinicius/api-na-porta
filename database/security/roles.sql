\set ON_ERROR_STOP on
\getenv app_password APP_PASSWORD
\getenv migrator_password MIGRATOR_PASSWORD
\getenv reader_password READER_PASSWORD
BEGIN;
SET LOCAL password_encryption = 'scram-sha-256';
DO $$
BEGIN
    IF current_database() <> 'naporta' THEN
        RAISE EXCEPTION 'Permissões devem ser aplicadas somente ao banco naporta';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naporta_migrator') THEN
        CREATE ROLE naporta_migrator LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naporta_app') THEN
        CREATE ROLE naporta_app LOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'naporta_reader') THEN
        CREATE ROLE naporta_reader LOGIN;
    END IF;
END $$;
ALTER ROLE naporta_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD :'migrator_password';
ALTER ROLE naporta_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 60 PASSWORD :'app_password';
ALTER ROLE naporta_reader NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10 PASSWORD :'reader_password';
REVOKE ALL ON DATABASE naporta FROM PUBLIC;
GRANT CONNECT ON DATABASE naporta TO naporta_migrator, naporta_app, naporta_reader;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION naporta_migrator;
ALTER SCHEMA public OWNER TO naporta_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO naporta_app, naporta_reader;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE naporta_migrator REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE naporta_migrator IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE naporta_migrator IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
-- Permissões por tabela são aplicadas após cada migration por grants.sql.
ALTER ROLE naporta_app IN DATABASE naporta SET search_path = public, pg_catalog;
ALTER ROLE naporta_reader IN DATABASE naporta SET search_path = public, pg_catalog;
ALTER ROLE naporta_migrator IN DATABASE naporta SET search_path = public, pg_catalog;
ALTER ROLE naporta_app SET statement_timeout = '5s';
ALTER ROLE naporta_app SET lock_timeout = '2s';
ALTER ROLE naporta_app SET idle_in_transaction_session_timeout = '10s';
ALTER ROLE naporta_reader SET default_transaction_read_only = on;
ALTER ROLE naporta_reader SET statement_timeout = '5s';
COMMIT;
