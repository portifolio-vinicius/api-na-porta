CREATE INDEX orders_active_created_idx ON public.orders (created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX orders_active_status_created_idx ON public.orders (status, created_at DESC, id DESC) WHERE deleted_at IS NULL;
