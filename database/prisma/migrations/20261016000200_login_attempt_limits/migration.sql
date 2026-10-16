CREATE TABLE public.login_attempts (
    key char(64) PRIMARY KEY CHECK (key ~ '^[0-9a-f]{64}$'),
    window_started_at timestamptz NOT NULL DEFAULT now(),
    attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    blocked_until timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_updated_at_idx ON public.login_attempts(updated_at);
CREATE FUNCTION public.prune_login_attempts() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    deleted_count integer;
BEGIN
    WITH expired AS (
        SELECT key
        FROM public.login_attempts
        WHERE updated_at < now() - interval '30 days'
        ORDER BY updated_at
        LIMIT 500
    )
    DELETE FROM public.login_attempts AS attempts
    USING expired
    WHERE attempts.key = expired.key;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_login_attempts() FROM PUBLIC;
