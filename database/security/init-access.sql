\set ON_ERROR_STOP on
\set app_password `cat /run/secrets/app_password`
\set migrator_password `cat /run/secrets/migrator_password`
\set reader_password `cat /run/secrets/reader_password`
SELECT length(:'app_password') > 0 AND length(:'migrator_password') > 0 AND length(:'reader_password') > 0 AS passwords_present
\gset
\if :passwords_present
    \setenv APP_PASSWORD :app_password
    \setenv MIGRATOR_PASSWORD :migrator_password
    \setenv READER_PASSWORD :reader_password
    \ir /opt/naporta/roles.sql
    \setenv APP_PASSWORD
    \setenv MIGRATOR_PASSWORD
    \setenv READER_PASSWORD
\else
    DO $$ BEGIN RAISE EXCEPTION 'Secrets de senha ausentes ou vazios'; END $$;
\endif
