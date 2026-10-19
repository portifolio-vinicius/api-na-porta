\set ON_ERROR_STOP on
BEGIN;
-- Executar como naporta_migrator após migrations no schema public.
-- Falhar se o schema estiver incompleto em vez de anunciar permissões aplicadas.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM naporta_app, naporta_reader;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM naporta_app, naporta_reader;
GRANT SELECT, INSERT, UPDATE ON public.orders, public.order_customers, public.order_addresses, public.order_items TO naporta_app;
GRANT SELECT, INSERT, UPDATE ON public.cache_versions TO naporta_app;
GRANT SELECT ON public.users TO naporta_app;
GRANT SELECT, INSERT, UPDATE ON public.login_attempts TO naporta_app;
GRANT EXECUTE ON FUNCTION public.prune_login_attempts() TO naporta_app;
GRANT SELECT ON public.orders, public.order_customers, public.order_addresses, public.order_items TO naporta_reader;
-- Somente sequences de tabelas onde a API pode inserir; nenhuma do usuário.
SELECT format('GRANT USAGE ON SEQUENCE %s TO naporta_app', pg_get_serial_sequence('public.' || table_name, 'id'))
FROM (VALUES ('orders'), ('order_items')) AS allowed(table_name)
WHERE pg_get_serial_sequence('public.' || table_name, 'id') IS NOT NULL
\gexec
COMMIT;
