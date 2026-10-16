ALTER TABLE public.order_items ADD COLUMN deleted_at timestamptz;
CREATE INDEX order_items_active_order_idx ON public.order_items(order_id) WHERE deleted_at IS NULL;
